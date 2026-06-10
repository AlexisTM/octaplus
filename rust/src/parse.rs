use chrono::{NaiveDate, NaiveTime};
use serde::Deserialize;

use crate::error::Error;
use crate::models::{DayQuotations, PricePoint};

#[derive(Deserialize)]
struct WireResponse {
    #[serde(rename = "Cotations")]
    cotations: DayList,
}

// The API returns a single object instead of a list when ToValidityDate is omitted.
#[derive(Deserialize)]
#[serde(untagged)]
enum DayList {
    Many(Vec<WireDay>),
    One(Box<WireDay>),
}

#[derive(Deserialize)]
struct WireDay {
    #[serde(rename = "ValidityDate")]
    validity_date: String,
    #[serde(rename = "PublicationDate")]
    publication_date: Option<String>,
    #[serde(rename = "PublicationTime")]
    publication_time: Option<String>,
    #[serde(rename = "CurrencyUnit")]
    currency_unit: Option<String>,
    #[serde(rename = "PriceMeasureUnit")]
    price_measure_unit: Option<String>,
    #[serde(rename = "Cotations")]
    cotations: Option<Vec<WirePoint>>,
    #[serde(rename = "InFault", default, deserialize_with = "de_in_fault")]
    in_fault: bool,
}

fn de_in_fault<'de, D: serde::Deserializer<'de>>(deserializer: D) -> Result<bool, D::Error> {
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum IntOrBool {
        Int(i64),
        Bool(bool),
    }
    Ok(match IntOrBool::deserialize(deserializer)? {
        IntOrBool::Int(v) => v != 0,
        IntOrBool::Bool(b) => b,
    })
}

#[derive(Deserialize)]
struct WirePoint {
    #[serde(rename = "Position")]
    position: u32,
    #[serde(rename = "TimeRange")]
    time_range: String,
    #[serde(rename = "PriceAmount")]
    price_amount: String,
}

pub(crate) fn parse_comma_decimal(s: &str) -> Result<f64, Error> {
    s.replace(',', ".")
        .parse()
        .map_err(|_| Error::InvalidResponse(format!("unparseable price amount {s:?}")))
}

pub(crate) fn parse_ddmmyyyy(s: &str) -> Result<NaiveDate, Error> {
    NaiveDate::parse_from_str(s, "%d/%m/%Y")
        .map_err(|_| Error::InvalidResponse(format!("unparseable date {s:?}")))
}

pub(crate) fn format_ddmmyyyy(date: NaiveDate) -> String {
    date.format("%d/%m/%Y").to_string()
}

fn parse_time(s: &str) -> Result<NaiveTime, Error> {
    NaiveTime::parse_from_str(s, "%H:%M:%S")
        .map_err(|_| Error::InvalidResponse(format!("unparseable time {s:?}")))
}

impl WireDay {
    fn into_model(self) -> Result<DayQuotations, Error> {
        let validity_date = parse_ddmmyyyy(&self.validity_date)?;
        if self.in_fault {
            return Ok(DayQuotations {
                validity_date,
                in_fault: true,
                publication_date: None,
                publication_time: None,
                currency_unit: None,
                price_measure_unit: None,
                prices: Vec::new(),
            });
        }
        let missing =
            |field: &str| Error::InvalidResponse(format!("day {validity_date} missing {field}"));
        let prices = self
            .cotations
            .ok_or_else(|| missing("Cotations"))?
            .into_iter()
            .map(|p| {
                Ok(PricePoint {
                    position: p.position,
                    time_range: p.time_range,
                    price: parse_comma_decimal(&p.price_amount)?,
                })
            })
            .collect::<Result<Vec<_>, Error>>()?;
        Ok(DayQuotations {
            validity_date,
            in_fault: false,
            publication_date: Some(parse_ddmmyyyy(
                self.publication_date
                    .as_deref()
                    .ok_or_else(|| missing("PublicationDate"))?,
            )?),
            publication_time: Some(parse_time(
                self.publication_time
                    .as_deref()
                    .ok_or_else(|| missing("PublicationTime"))?,
            )?),
            currency_unit: self.currency_unit,
            price_measure_unit: self.price_measure_unit,
            prices,
        })
    }
}

pub(crate) fn parse_body(body: &str) -> Result<Vec<DayQuotations>, Error> {
    let wire: WireResponse = serde_json::from_str(body)
        .map_err(|e| Error::InvalidResponse(format!("unparseable body: {e}")))?;
    let days = match wire.cotations {
        DayList::Many(days) => days,
        DayList::One(day) => vec![*day],
    };
    days.into_iter().map(WireDay::into_model).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    const HOUR_TWO_DAYS: &str = include_str!("../../fixtures/hour_two_days.json");
    const QUARTER_HOUR_ONE_DAY: &str = include_str!("../../fixtures/quarter_hour_one_day.json");
    const IN_FAULT_DAYS: &str = include_str!("../../fixtures/in_fault_days.json");
    const MIXED_DAYS: &str = include_str!("../../fixtures/mixed_days.json");

    fn date(y: i32, m: u32, d: u32) -> NaiveDate {
        NaiveDate::from_ymd_opt(y, m, d).unwrap()
    }

    #[test]
    fn comma_decimal_parsing() {
        assert_eq!(parse_comma_decimal("112,7175").unwrap(), 112.7175);
        assert_eq!(
            parse_comma_decimal("107,28999999999999").unwrap(),
            107.28999999999999
        );
        assert_eq!(parse_comma_decimal("109").unwrap(), 109.0);
        assert!(matches!(
            parse_comma_decimal("abc"),
            Err(Error::InvalidResponse(_))
        ));
    }

    #[test]
    fn ddmmyyyy_round_trip() {
        assert_eq!(parse_ddmmyyyy("10/06/2026").unwrap(), date(2026, 6, 10));
        assert_eq!(format_ddmmyyyy(date(2026, 6, 10)), "10/06/2026");
        assert!(matches!(
            parse_ddmmyyyy("2026-06-10"),
            Err(Error::InvalidResponse(_))
        ));
    }

    #[test]
    fn hour_two_days_fixture() {
        let days = parse_body(HOUR_TWO_DAYS).unwrap();
        assert_eq!(days.len(), 2);
        assert_eq!(days[0].validity_date, date(2026, 6, 10));
        assert_eq!(days[1].validity_date, date(2026, 6, 11));
        for day in &days {
            assert!(day.is_available());
            assert!(!day.in_fault);
            assert_eq!(day.prices.len(), 24);
        }
        assert_eq!(days[0].publication_date, Some(date(2026, 6, 9)));
        assert_eq!(
            days[0].publication_time,
            Some(NaiveTime::from_hms_opt(14, 30, 0).unwrap())
        );
        assert_eq!(days[0].currency_unit.as_deref(), Some("EUR"));
        assert_eq!(days[0].price_measure_unit.as_deref(), Some("MWh"));
        let first = &days[0].prices[0];
        assert_eq!(first.position, 1);
        assert_eq!(first.time_range, "00 - 01");
        assert_eq!(first.price, 112.7175);
        assert_eq!(days[0].prices[1].price, 107.28999999999999);
        assert_eq!(days[0].prices[23].time_range, "23 - 24");
    }

    #[test]
    fn quarter_hour_fixture() {
        let days = parse_body(QUARTER_HOUR_ONE_DAY).unwrap();
        assert_eq!(days.len(), 1);
        assert_eq!(days[0].prices.len(), 96);
        assert_eq!(days[0].prices[0].time_range, "00:00 - 00:15");
        assert_eq!(days[0].prices[95].time_range, "23:45 - 24:00");
        assert_eq!(days[0].prices[95].position, 96);
    }

    #[test]
    fn in_fault_fixture() {
        let days = parse_body(IN_FAULT_DAYS).unwrap();
        assert_eq!(days.len(), 2);
        for day in &days {
            assert!(day.in_fault);
            assert!(!day.is_available());
            assert!(day.prices.is_empty());
            assert_eq!(day.publication_date, None);
            assert_eq!(day.publication_time, None);
            assert_eq!(day.currency_unit, None);
            assert_eq!(day.price_measure_unit, None);
        }
        assert_eq!(days[0].validity_date, date(2026, 6, 15));
        assert_eq!(days[1].validity_date, date(2026, 6, 16));
    }

    #[test]
    fn mixed_fixture() {
        let days = parse_body(MIXED_DAYS).unwrap();
        assert_eq!(days.len(), 3);
        assert!(days[0].is_available());
        assert_eq!(days[0].prices.len(), 24);
        assert!(!days[1].is_available());
        assert!(!days[2].is_available());
        assert_eq!(days[2].validity_date, date(2026, 6, 13));
    }

    #[test]
    fn single_object_cotations_treated_as_one_day_list() {
        let body = r#"{"InFault":0,"Cotations":{"ValidityDate":"15/06/2026","InFault":1}}"#;
        let days = parse_body(body).unwrap();
        assert_eq!(days.len(), 1);
        assert_eq!(days[0].validity_date, date(2026, 6, 15));
        assert!(!days[0].is_available());
    }

    #[test]
    fn garbage_body_is_invalid_response() {
        assert!(matches!(
            parse_body("not json"),
            Err(Error::InvalidResponse(_))
        ));
        assert!(matches!(
            parse_body(r#"{"Cotations":42}"#),
            Err(Error::InvalidResponse(_))
        ));
    }

    #[test]
    fn bad_date_in_day_is_invalid_response() {
        let body = r#"{"Cotations":[{"ValidityDate":"banana","InFault":1}]}"#;
        assert!(matches!(parse_body(body), Err(Error::InvalidResponse(_))));
    }

    #[test]
    fn in_fault_accepts_bool_and_missing_means_false() {
        let body = r#"{"Cotations":[{"ValidityDate":"15/06/2026","InFault":true}]}"#;
        assert!(parse_body(body).unwrap()[0].in_fault);

        let body = r#"{"Cotations":[{"ValidityDate":"15/06/2026"}]}"#;
        // missing InFault means available, so the missing Cotations list must error
        assert!(matches!(parse_body(body), Err(Error::InvalidResponse(_))));
    }

    #[test]
    fn available_day_requires_publication_metadata() {
        let body = r#"{"Cotations":[{"ValidityDate":"10/06/2026","InFault":0,
            "PublicationTime":"14:30:00","CurrencyUnit":"EUR","PriceMeasureUnit":"MWh",
            "Cotations":[{"Position":1,"TimeRange":"00 - 01","PriceAmount":"1,0"}]}]}"#;
        assert!(matches!(parse_body(body), Err(Error::InvalidResponse(_))));
    }

    #[test]
    fn in_fault_day_is_normalized_regardless_of_wire_content() {
        let body = r#"{"Cotations":[{"ValidityDate":"15/06/2026","InFault":1,
            "CurrencyUnit":"EUR","PublicationDate":"14/06/2026",
            "Cotations":[{"Position":1,"TimeRange":"00 - 01","PriceAmount":"1,0"}]}]}"#;
        let day = &parse_body(body).unwrap()[0];
        assert!(day.in_fault);
        assert!(day.prices.is_empty());
        assert_eq!(day.currency_unit, None);
        assert_eq!(day.publication_date, None);
    }
}
