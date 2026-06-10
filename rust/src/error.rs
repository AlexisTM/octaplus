use chrono::NaiveDate;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("invalid date range: end {end} is before start {start}")]
    InvalidDateRange { start: NaiveDate, end: NaiveDate },
    #[error("transport error")]
    Transport(#[source] reqwest::Error),
    #[error("unexpected HTTP status {status}")]
    Status { status: reqwest::StatusCode },
    #[error("invalid response: {0}")]
    InvalidResponse(String),
}
