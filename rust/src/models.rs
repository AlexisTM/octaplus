use chrono::{NaiveDate, NaiveTime};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum Granularity {
    #[default]
    Hour,
    QuarterHour,
}

impl Granularity {
    pub fn as_str(&self) -> &'static str {
        match self {
            Granularity::Hour => "HOUR",
            Granularity::QuarterHour => "QUARTER_HOUR",
        }
    }

    /// Observed 10/06/2026; the operator backfills, so treat as a hint —
    /// [`crate::Client::get_earliest_validity_date`] discovers the live floor.
    pub fn known_earliest_validity_date(&self) -> NaiveDate {
        let (y, m, d) = match self {
            Granularity::Hour => (2023, 4, 11),
            Granularity::QuarterHour => (2025, 11, 1),
        };
        NaiveDate::from_ymd_opt(y, m, d).expect("valid date")
    }
}

/// One price point; `price` is in EUR/MWh.
#[derive(Debug, Clone, PartialEq)]
pub struct PricePoint {
    pub position: u32,
    pub time_range: String,
    pub price: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct DayQuotations {
    pub validity_date: NaiveDate,
    pub in_fault: bool,
    pub publication_date: Option<NaiveDate>,
    pub publication_time: Option<NaiveTime>,
    pub currency_unit: Option<String>,
    pub price_measure_unit: Option<String>,
    pub prices: Vec<PricePoint>,
}

impl DayQuotations {
    pub fn is_available(&self) -> bool {
        !self.in_fault
    }
}
