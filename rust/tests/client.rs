use chrono::NaiveDate;
use octaplus::{Client, Error, Granularity};
use wiremock::matchers::{method, path, query_param};
use wiremock::{Mock, MockServer, ResponseTemplate};

const HOUR_TWO_DAYS: &str = include_str!("../../fixtures/hour_two_days.json");
const QUARTER_HOUR_ONE_DAY: &str = include_str!("../../fixtures/quarter_hour_one_day.json");

fn date(y: i32, m: u32, d: u32) -> NaiveDate {
    NaiveDate::from_ymd_opt(y, m, d).unwrap()
}

async fn mock_endpoint(server: &MockServer, body: &str) {
    Mock::given(method("GET"))
        .and(path("/websiterest/GetTarDynCotations"))
        .respond_with(ResponseTemplate::new(200).set_body_raw(body, "application/json"))
        .mount(server)
        .await;
}

#[tokio::test]
async fn sends_exact_query_params_with_end_defaulted_to_start() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/websiterest/GetTarDynCotations"))
        .and(query_param("ValidityDate", "10/06/2026"))
        .and(query_param("ToValidityDate", "10/06/2026"))
        .and(query_param("Granularity", "HOUR"))
        .and(query_param("CallStating", "0"))
        .respond_with(ResponseTemplate::new(200).set_body_raw(HOUR_TWO_DAYS, "application/json"))
        .expect(1)
        .mount(&server)
        .await;

    let client = Client::new().with_base_url(server.uri());
    let days = client
        .get_quotations(date(2026, 6, 10), None, Granularity::Hour)
        .await
        .unwrap();
    assert_eq!(days.len(), 2);
    assert_eq!(days[0].prices[0].price, 112.7175);
}

#[tokio::test]
async fn sends_quarter_hour_wire_string_and_explicit_end() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/websiterest/GetTarDynCotations"))
        .and(query_param("ValidityDate", "10/06/2026"))
        .and(query_param("ToValidityDate", "12/06/2026"))
        .and(query_param("Granularity", "QUARTER_HOUR"))
        .and(query_param("CallStating", "0"))
        .respond_with(
            ResponseTemplate::new(200).set_body_raw(QUARTER_HOUR_ONE_DAY, "application/json"),
        )
        .expect(1)
        .mount(&server)
        .await;

    let client = Client::new().with_base_url(server.uri());
    client
        .get_quotations(
            date(2026, 6, 10),
            Some(date(2026, 6, 12)),
            Granularity::QuarterHour,
        )
        .await
        .unwrap();
}

#[tokio::test]
async fn http_500_maps_to_status_error() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .respond_with(ResponseTemplate::new(500))
        .mount(&server)
        .await;

    let client = Client::new().with_base_url(server.uri());
    let err = client
        .get_quotations(date(2026, 6, 10), None, Granularity::Hour)
        .await
        .unwrap_err();
    match err {
        Error::Status { status } => assert_eq!(status.as_u16(), 500),
        other => panic!("expected Status error, got {other:?}"),
    }
}

#[tokio::test]
async fn garbage_body_maps_to_invalid_response() {
    let server = MockServer::start().await;
    mock_endpoint(&server, "<html>not json</html>").await;

    let client = Client::new().with_base_url(server.uri());
    let err = client
        .get_quotations(date(2026, 6, 10), None, Granularity::Hour)
        .await
        .unwrap_err();
    assert!(matches!(err, Error::InvalidResponse(_)));
}

#[tokio::test]
async fn end_before_start_is_invalid_date_range() {
    let client = Client::new().with_base_url("http://127.0.0.1:1");
    let err = client
        .get_quotations(date(2026, 6, 10), Some(date(2026, 6, 9)), Granularity::Hour)
        .await
        .unwrap_err();
    match err {
        Error::InvalidDateRange { start, end } => {
            assert_eq!(start, date(2026, 6, 10));
            assert_eq!(end, date(2026, 6, 9));
        }
        other => panic!("expected InvalidDateRange, got {other:?}"),
    }
}

#[tokio::test]
async fn get_day_returns_single_entry() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/websiterest/GetTarDynCotations"))
        .and(query_param("ValidityDate", "10/06/2026"))
        .and(query_param("ToValidityDate", "10/06/2026"))
        .and(query_param("Granularity", "QUARTER_HOUR"))
        .and(query_param("CallStating", "0"))
        .respond_with(
            ResponseTemplate::new(200).set_body_raw(QUARTER_HOUR_ONE_DAY, "application/json"),
        )
        .expect(1)
        .mount(&server)
        .await;

    let client = Client::new().with_base_url(server.uri());
    let day = client
        .get_day(date(2026, 6, 10), Granularity::QuarterHour)
        .await
        .unwrap();
    assert!(day.is_available());
    assert_eq!(day.validity_date, date(2026, 6, 10));
    assert_eq!(day.prices.len(), 96);
}

#[tokio::test]
async fn get_day_with_unexpected_entry_count_is_invalid_response() {
    let server = MockServer::start().await;
    mock_endpoint(&server, HOUR_TWO_DAYS).await;

    let client = Client::new().with_base_url(server.uri());
    let err = client
        .get_day(date(2026, 6, 10), Granularity::Hour)
        .await
        .unwrap_err();
    assert!(matches!(err, Error::InvalidResponse(_)));
}
