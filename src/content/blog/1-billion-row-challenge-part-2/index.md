---
title: The 1 Billion Row Challenge - Part 2
date: '2024-02-17T10:46:00.000Z'
description: Revisiting the 1 billion row challenge with Rust and Postgres.
---

I recently wrote about my solution to the
[The 1 Billion Row Challenge](/blog/1-billion-row-challenge-part-1), a challenge
that requires you to read 1 billion rows from a text file then calculate the
min, max, and mean temperature readings for each weather station. The goal was
to push modern Java's performance to the limit. I have been curious how a
similar approach would perform in other languages or tools. While I won't be
accurately benchmarking every solution, I am interested in the rough
comparison and what the final code would look like. With that out of the way,
let's dive into a real complied language - Rust.

## Blazing Fast (TM)

I had an approach from the Java solution that I wanted to try to implement in
Rust: memory map the file, split it into chunks, process each chunk with a
thread, then combine the results from each thread. With Rust I knew you can
customize the hasher for a HashMap, so I wanted to try using a faster hasher
that did not need to be cryptographically secure. Finally, although SIMD
didn't dramatically improve performance in Java, I was hoping still building a
vector would allow the compiler to optimize the min, max, and sum operations.

With this in mind, I memory mapped the file:

```rust
let mmap = unsafe { MmapOptions::new().map(&file)? };
let mmap: &'static Mmap = Box::leak(Box::new(mmap));
```

Split the file into chunks:

```rust
let len = mmap.len();
let num_chunks = 4;
let chunk_size = len / num_chunks;

let mut threads = vec![];
for i in 0..num_chunks {
    let mut start = 0;
    let mut end = len;

    // find the start and end adjusted to the nearest newline
    if i > 0 {
        start = mmap.iter()
            .skip(i * chunk_size)
            .position(|&b| b == b'\n')
            .map_or(i * chunk_size, |pos| i * chunk_size + pos + 1);
    }
    if i < num_chunks - 1 {
        end = mmap.iter()
            .skip((i + 1) * chunk_size)
            .position(|&b| b == b'\n')
            .map_or((i + 1) * chunk_size, |pos| (i + 1) * chunk_size + pos + 1);
    }

    let handle = thread::spawn(move || {
        let chunk = &mmap[start..end];

        // ...
    });
}

```

With each chunk setup, I then parsed each line and added them to a HashMap
using the `ahash` crate:

```rust
let mut map: AHashMap<String, Vec<f64>> = AHashMap::new();
chunk.split(|&b| b == b'\n').for_each(|line| {
    if line.is_empty() {
        return;
    }
    if let Some(separator_index) = line.iter().position(|&b| b == b';') {
        let (station, temp_with_separator) = line.split_at(separator_index);
        let temp = &temp_with_separator[1..]; // Skip the separator itself

        let station_name = std::str::from_utf8(station).unwrap_or_default();
        let temperature_str = std::str::from_utf8(temp).unwrap_or_default();

        if let Ok(temperature) = temperature_str.parse::<f64>() {
            map.entry(station_name.to_string())
                .or_insert(vec![])
                .push(temperature);
        }
    }
});
```

Calculated the min, max, sum and count for each station and return it
as a HashMap:

```rust
let mut calculation_map = AHashMap::new();

// ...

for (station, temperatures) in map.iter() {
    let mut min = f64::MAX;
    let mut max = f64::MIN;
    let mut sum = 0.0;
    for &temperature in temperatures {
        if temperature < min {
            min = temperature;
        }
        if temperature > max {
            max = temperature;
        }
        sum += temperature;
    }
    // let min = temperatures.iter().fold(f64::MAX, |a, &b| a.min(b));
    // let max = temperatures.iter().fold(f64::MIN, |a, &b| a.max(b));
    // let sum: f64 = temperatures.iter().sum();
    let len = temperatures.len();

    calculation_map.insert(
        station.to_string(),
        CalculationResult { min, max, sum, len },
    );
}
```

Then finally, combine the results from each thread:

```rust
fn combine_maps(
    mut map1: AHashMap<String, CalculationResult>,
    map2: &AHashMap<String, CalculationResult>,
) -> AHashMap<String, CalculationResult> {
    for (key, value) in map2 {
        let entry = map1.entry(key.into()).or_insert(CalculationResult {
            min: f64::MAX,
            max: f64::MIN,
            sum: 0.0,
            len: 0,
        });
        entry.min = entry.min.min(value.min);
        entry.max = entry.max.max(value.max);
        entry.sum += value.sum;
        entry.len += value.len;
    }
    map1
}
```

```rust
let mut results = Vec::new();
for handle in threads {
    results.push(handle.join().unwrap());
    println!("Thread finished");
}

let results = results.iter().fold(AHashMap::new(), combine_maps);

```

## To Infinity

Turns out it didn't even finish. I let it run for a few minutes before
assuming there was an infinite loop or deadlock and killed it. After
re-reading the code I quickly realized this was just a simple oversight. It
was obvious once I thought about how the HashMap was being updated. The
`f64` was being added to the `Vec<f64>` for every line, duplicating the memory
that was already being read. The worst part was since `Vec` is a dynamic
array, it was constantly being sized up requiring a new array to be allocated
and the data to be painstakingly copied over.

## A New Hope

I decided to forget about SIMD and compiler optimizations for
now and change this implementation to more closely match the Java solution.
This time each thread would update the min, max, sum, and count for each
temperature value parsed:

```rust
let handle = thread::spawn(move || {
    let chunk = &mmap[start..end];

    let mut map: AHashMap<String, CalculationResult> = AHashMap::new();
    chunk.split(|&b| b == b'\n').for_each(|line| {
        if line.is_empty() {
            return;
        }
        if let Some(separator_index) = line.iter().position(|&b| b == b';') {
            let (station, temp_with_separator) = line.split_at(separator_index);
            let temp = &temp_with_separator[1..]; // Skip the separator itself

            let station_name = std::str::from_utf8(station).unwrap_or_default();
            let temperature_str = std::str::from_utf8(temp).unwrap_or_default();

            if let Ok(temperature) = temperature_str.parse::<f64>() {
                map.entry(station_name.to_string())
                    .and_modify(|e| {
                        e.min = e.min.min(temperature);
                        e.max = e.max.max(temperature);
                        e.sum += temperature;
                        e.len += 1;
                    })
                    .or_insert(CalculationResult {
                        min: temperature,
                        max: temperature,
                        sum: temperature,
                        len: 1,
                    });
            }
        }

    });
    map
});
```

## The Race Is On

After the updates, running the program resulted in processing all 1 billion
rows in just 22 seconds, almost a 30% improvement over the previous Java
solution.

```sh
Benchmark 1: target/release/brc-rs
  Time (mean ± σ):     21.586 s ±  0.245 s    [User: 84.719 s, System: 18.306 s]
  Range (min … max):   21.269 s … 21.984 s    10 runs
```

This got me thinking, 22 seconds is pretty good for a first try (who's
counting anyway?) but there are entire software companies and projects
dedicated to loading and processing data as fast as possible. A database like
Postgres has had hundreds of engineers carefully optimizing it over decades.
Although supporting more general workloads has its overhead, I figured loading
a CSV and calculating the min, max, and mean would be its bread and butter.
How naive I was...

## Postgres

I haven't used Postgres in years, but I'm sure ChatGPT can pick up the slack.
First was getting it installed and the table created.

```bash
brew install postgres
brew services start postgresql
```

With Postgres installed I created the database and table.

```bash
psql -h localhost -d "postgres" -c "CREATE DATABASE challenge;"
psql -h localhost -d "challenge" -c "CREATE TABLE IF NOT EXISTS measurements (station_name VARCHAR(255), temperature DECIMAL(3,1));
```

Then load the measurements!

```bash
time psql -h localhost -d "challenge" -c "\copy measurements(station_name, temperature) FROM 'measurements.txt' DELIMITER ';' CSV;"
```

![Patiently Waiting Meme](./patiently_waiting.jpg ' ')

I knew it wasn't going to be that easy. After about 10 minutes my hard drive
filled up. Granted I only had 40 GB free when I started this process, 10
minutes was still significantly worse than what I was expecting. After
cleaning up some unused data I noticed many write-ahead-logs in the Postgres
directory. To prevent logging on this table, I changed the `CREATE TABLE`
command to `CREATE UNLOGGED TABLE`. I also asked ChatGPT what settings I could
tweak to get better performance loading which recommended setting the
`max_parallel_workers_per_gather`. When going to set this I saw some other
worker counts and set them all to 10. This would probably cause an issue in a
production database, but thankfully the load process and query process would
be isolated.

```txt
max_worker_processes = 10		# (change requires restart)
max_parallel_workers_per_gather = 10	# taken from max_parallel_workers
max_parallel_maintenance_workers = 10	# taken from max_parallel_workers
max_parallel_workers = 10		# maximum number of max_worker_processes that
```

## Crunch The Numbers

In addition to the `postgres.conf` settings, I set `maintenance_work_mem`
for good measure. With that I started copying the data:

```bash
time (psql -h localhost -d "challenge" -c "SET maintenance_work_mem = '8GB';" && psql -h localhost -d "challenge" -c "\copy measurements(station_name, temperature) FROM 'measurements.txt' DELIMITER ';' CSV;")
```

The full load took 5 minutes and 2 seconds and used 45GB of disk space.

```bash
SET
COPY 1000000000
( psql -h localhost -d "challenge" -c "SET maintenance_work_mem = '1GB';" && )
118.77s user 16.68s system 44% cpu 5:02.16 total
```

```bash
du -ha /opt/homebrew/var/postgresql@14 | sort -h
[...]
 45G	/opt/homebrew/var/postgresql@14
```

This was already many times slower than either of the previous solutions, but
how long does the calculation actually take now the data is Postgres?

```txt
time psql -h localhost -d "challenge" -P pager=off -c "SELECT station_name, ROUND(MIN(temperature), 1) AS min_temp, ROUND(AVG(temperature), 1) AS mean_temp, ROUND(MAX(temperature), 1) AS max_temp FROM measurements GROUP BY station_name ORDER BY station_name;"

psql -h localhost -d "challenge" -P pager=off -c   0.01s user 0.02s system 0% cpu 1:13.08 total
```

The `SELECT` takes just over a minute to run. This makes sense thinking about
all of the extra overhead Postgres needs to construct the table and query it.
Each record needs to be saved in a fixed length format including updating all
the metadata for the table and Postgres internals. Then the entire table needs
to be scanned, reading from disk, while preforming arbitrary calculations over
the data. It's pretty impressive this can still be done in just about a minute!

## Conclusion

As expected the Rust solution ended up being the fastest of the three I tried.
However it was surprising that there wasn't that much difference between the
Rust and Java version, a real testament to all of the work that has gone into
optimizing modern JVM implementations. The results from Postgres were
surprising in a few different ways. I was expecting loading the data
efficiently would have been far easier than it turned to out be and I was
surprised the final `SELECT` wasn't faster. The upside to the Postgres
solution was it took me a fraction of the time of the others.

All in all this was a really fun project. I've learned a ton about the
performance characteristics of Java and a ton of tricks to optimize
and test a program's performance.
