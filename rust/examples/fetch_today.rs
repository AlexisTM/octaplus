use octaplus::{Client, Granularity};

#[tokio::main(flavor = "current_thread")]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let today = chrono::Local::now().date_naive();
    let client = Client::new();
    let day = client.get_day(today, Granularity::Hour).await?;

    if !day.is_available() {
        println!("{}: no data published yet", day.validity_date);
        return Ok(());
    }

    println!(
        "{} ({} points, {}/{})",
        day.validity_date,
        day.prices.len(),
        day.currency_unit.as_deref().unwrap_or("?"),
        day.price_measure_unit.as_deref().unwrap_or("?"),
    );
    for point in day.prices.iter().take(6) {
        println!(
            "{:>2}  {}  {:>10.4}",
            point.position, point.time_range, point.price
        );
    }
    Ok(())
}
