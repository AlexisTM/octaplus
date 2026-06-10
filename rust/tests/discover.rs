use chrono::NaiveDate;
use octaplus::{Client, Error, Granularity};
use wiremock::matchers::{method, path};
use wiremock::{Mock, MockServer, Request, Respond, ResponseTemplate};

fn date(y: i32, m: u32, d: u32) -> NaiveDate {
    NaiveDate::from_ymd_opt(y, m, d).unwrap()
}

struct FloorResponder {
    floor: Option<NaiveDate>,
}

impl Respond for FloorResponder {
    fn respond(&self, request: &Request) -> ResponseTemplate {
        let raw = request
            .url
            .query_pairs()
            .find(|(k, _)| k == "ValidityDate")
            .map(|(_, v)| v.into_owned())
            .unwrap();
        let day = NaiveDate::parse_from_str(&raw, "%d/%m/%Y").unwrap();
        let body = match self.floor {
            Some(floor) if day >= floor => format!(
                r#"{{"Cotations":[{{"ValidityDate":"{raw}","PublicationDate":"{raw}","PublicationTime":"14:30:00","CurrencyUnit":"EUR","PriceMeasureUnit":"MWh","Cotations":[{{"Position":1,"TimeRange":"00 - 01","PriceAmount":"100,0"}}],"InFault":0}}]}}"#
            ),
            _ => format!(r#"{{"Cotations":[{{"ValidityDate":"{raw}","InFault":1}}]}}"#),
        };
        ResponseTemplate::new(200).set_body_raw(body, "application/json")
    }
}

async fn floor_server(floor: Option<NaiveDate>) -> MockServer {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/websiterest/GetTarDynCotations"))
        .respond_with(FloorResponder { floor })
        .mount(&server)
        .await;
    server
}

async fn request_count(server: &MockServer) -> usize {
    server.received_requests().await.unwrap().len()
}

#[tokio::test]
async fn discovers_synthetic_floor_by_bisection() {
    let floor = date(2024, 3, 15);
    let server = floor_server(Some(floor)).await;
    let client = Client::new().with_base_url(server.uri());
    let result = client
        .get_earliest_validity_date(Granularity::Hour)
        .await
        .unwrap();
    assert_eq!(result, Some(floor));
    assert!(request_count(&server).await <= 20);
}

#[tokio::test]
async fn fast_path_confirms_known_floor_in_two_requests() {
    let known = Granularity::Hour.known_earliest_validity_date();
    let server = floor_server(Some(known)).await;
    let client = Client::new().with_base_url(server.uri());
    let result = client
        .get_earliest_validity_date(Granularity::Hour)
        .await
        .unwrap();
    assert_eq!(result, Some(known));
    assert_eq!(request_count(&server).await, 2);
}

#[tokio::test]
async fn discovers_backfilled_earlier_floor() {
    let floor = date(2022, 1, 1);
    let server = floor_server(Some(floor)).await;
    let client = Client::new().with_base_url(server.uri());
    let result = client
        .get_earliest_validity_date(Granularity::QuarterHour)
        .await
        .unwrap();
    assert_eq!(result, Some(floor));
}

#[tokio::test]
async fn nothing_available_returns_none_in_three_requests() {
    let server = floor_server(None).await;
    let client = Client::new().with_base_url(server.uri());
    let result = client
        .get_earliest_validity_date(Granularity::Hour)
        .await
        .unwrap();
    assert_eq!(result, None);
    assert_eq!(request_count(&server).await, 3);
}

#[tokio::test]
async fn probe_errors_propagate() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .respond_with(ResponseTemplate::new(500))
        .mount(&server)
        .await;
    let client = Client::new().with_base_url(server.uri());
    let err = client
        .get_earliest_validity_date(Granularity::Hour)
        .await
        .unwrap_err();
    assert!(matches!(err, Error::Status { .. }));
}
