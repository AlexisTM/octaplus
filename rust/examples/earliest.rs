use octaplus::{Client, Granularity};

#[tokio::main(flavor = "current_thread")]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = Client::new();
    for granularity in [Granularity::Hour, Granularity::QuarterHour] {
        match client.get_earliest_validity_date(granularity).await? {
            Some(day) => println!("{} {day}", granularity.as_str()),
            None => println!("{} none", granularity.as_str()),
        }
    }
    Ok(())
}
