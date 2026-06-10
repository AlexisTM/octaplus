//! Async client for the Octaplus dynamic-tariff quotations API.
//!
//! A day with no published data comes back as a normal [`DayQuotations`]
//! with `in_fault == true` and empty `prices`, not as an error.

mod client;
mod error;
mod models;
mod parse;

pub use client::{Client, DEFAULT_BASE_URL, DEFAULT_TIMEOUT};
pub use error::Error;
pub use models::{DayQuotations, Granularity, PricePoint};
