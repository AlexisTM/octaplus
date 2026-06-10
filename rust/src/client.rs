use std::time::Duration;

use chrono::{Datelike, Days, Local, NaiveDate};

use crate::error::Error;
use crate::models::{DayQuotations, Granularity};
use crate::parse;

fn search_floor() -> NaiveDate {
    NaiveDate::from_ymd_opt(2000, 1, 1).expect("valid date")
}

pub const DEFAULT_BASE_URL: &str = "https://srv.octaplus.be";
pub const DEFAULT_TIMEOUT: Duration = Duration::from_secs(10);

#[derive(Debug, Clone)]
pub struct Client {
    http: reqwest::Client,
    base_url: String,
    timeout: Duration,
}

impl Default for Client {
    fn default() -> Self {
        Self::new()
    }
}

impl Client {
    pub fn new() -> Self {
        Self {
            http: reqwest::Client::new(),
            base_url: DEFAULT_BASE_URL.to_string(),
            timeout: DEFAULT_TIMEOUT,
        }
    }

    pub fn with_base_url(mut self, base_url: impl Into<String>) -> Self {
        self.base_url = base_url.into();
        self
    }

    pub fn with_timeout(mut self, timeout: Duration) -> Self {
        self.timeout = timeout;
        self
    }

    pub async fn get_quotations(
        &self,
        start: NaiveDate,
        end: Option<NaiveDate>,
        granularity: Granularity,
    ) -> Result<Vec<DayQuotations>, Error> {
        let end = end.unwrap_or(start);
        if end < start {
            return Err(Error::InvalidDateRange { start, end });
        }
        let url = format!(
            "{}/websiterest/GetTarDynCotations",
            self.base_url.trim_end_matches('/')
        );
        let response = self
            .http
            .get(&url)
            .query(&[
                ("ValidityDate", parse::format_ddmmyyyy(start).as_str()),
                ("ToValidityDate", parse::format_ddmmyyyy(end).as_str()),
                ("Granularity", granularity.as_str()),
                ("CallStating", "0"),
            ])
            .timeout(self.timeout)
            .send()
            .await
            .map_err(Error::Transport)?;
        let status = response.status();
        if !status.is_success() {
            return Err(Error::Status { status });
        }
        let body = response.text().await.map_err(Error::Transport)?;
        parse::parse_body(&body)
    }

    pub async fn get_day(
        &self,
        day: NaiveDate,
        granularity: Granularity,
    ) -> Result<DayQuotations, Error> {
        let mut days = self.get_quotations(day, Some(day), granularity).await?;
        if days.len() != 1 {
            return Err(Error::InvalidResponse(format!(
                "expected 1 day entry, got {}",
                days.len()
            )));
        }
        Ok(days.remove(0))
    }

    async fn day_available(&self, day: NaiveDate, granularity: Granularity) -> Result<bool, Error> {
        Ok(self.get_day(day, granularity).await?.is_available())
    }

    /// Discovers the earliest date with published data by probing the live API
    /// (2 requests when the known floor still holds, ~15 when it moved).
    /// Assumes availability is contiguous from the floor through today;
    /// `Ok(None)` when no day has data at all.
    pub async fn get_earliest_validity_date(
        &self,
        granularity: Granularity,
    ) -> Result<Option<NaiveDate>, Error> {
        let known = granularity.known_earliest_validity_date();
        let one = Days::new(1);
        let (lo, hi) = if self.day_available(known, granularity).await? {
            let prev = known - one;
            if !self.day_available(prev, granularity).await? {
                return Ok(Some(known));
            }
            (search_floor(), prev)
        } else {
            let today = Local::now().date_naive();
            let hi = if self.day_available(today, granularity).await? {
                today
            } else {
                let yesterday = today - one;
                if !self.day_available(yesterday, granularity).await? {
                    return Ok(None);
                }
                yesterday
            };
            (known + one, hi)
        };
        let (mut lo_o, mut hi_o) = (lo.num_days_from_ce(), hi.num_days_from_ce());
        while lo_o < hi_o {
            let mid = (lo_o + hi_o) / 2;
            let mid_date = NaiveDate::from_num_days_from_ce_opt(mid).expect("valid ordinal");
            if self.day_available(mid_date, granularity).await? {
                hi_o = mid;
            } else {
                lo_o = mid + 1;
            }
        }
        Ok(NaiveDate::from_num_days_from_ce_opt(hi_o))
    }
}
