---
title: The 1 Billion Row Challenge - Part 1
date: '2024-02-08T10:37:00.000Z'
description:
  The 1 Billion Row Challenge is a competition to read and process a billion rows
  from a text file in Java. This is the first part of a series of posts that will explore my
  approach and what I learned along the way.
---

The [1 Billion Row Challenge](https://github.com/gunnarmorling/1brc) is a
competition to read and process a billion rows from a text file in Java. The
[README](https://github.com/gunnarmorling/1brc/blob/main/README.md) for the
challenge states:

> The One Billion Row Challenge (1BRC) is a fun exploration of how far modern
> Java can be pushed for aggregating one billion rows from a text file. Grab
> all your (virtual) threads, reach out to SIMD, optimize your GC, or pull any
> other trick, and create the fastest implementation for solving this task!
>
> The text file contains temperature values for a range of weather stations.
> Each row is one measurement in the format
> `<string: station name>;<double: measurement>`, with the measurement value
> having exactly one fractional digit.
>
> ```csv
> Hamburg;12.0
> Bulawayo;8.9
> Palembang;38.8
> ```
>
> The task is to write a Java program which reads the file, calculates the min,
> mean, and max temperature value per weather station, and emits the results on
> stdout

My mind started racing with ideas picturing all sorts of arcane low level APIs,
compiler tricks, and JVM internals I could use. Most of which I barely knew the
name of let alone how to use them. I was excited to dive in and learn as much
as I could about what pushing the limits of Java would look like in practice.

## The Rules

The rules of the challenge are simple:

- All calculations have to be done at runtime
- Implementations must not rely on specifics of a given data set
- Implementations must be provided as a single source file
- No external library dependencies may be used

The [README](https://github.com/gunnarmorling/1brc/blob/main/README.md)
describes how to create the dataset which resulted in a ~13GB file. With my
measurements generated, I was ready to dive in.

## My Plan

From my brief exploration in C, I knew memory mapping a file was a fast way to
read large files, leaning on the operating system to manage
loading the file into memory. This would be particularly useful with such a
large file that could consume all available memory. The operating
system would ensure the correct pages are loaded into memory when needed and
evict them after they are no longer used.

Finally, I remember reading about Java's ConcurrentHashMap after being
frustrated with lock contention in Rust when trying to share a
`Arc<Mutex<HashMap>>` between threads. The implementation of Java's
ConcurrentHashMap was touted as a clever design to reduce lock contention and
provide a high level of concurrency.

My overall approach was:

- Memory map the file
- Create a thread pool
- Have each thread read a chunk of the memory mapped file
- Parse the chunk into weather stations and temperature values
- Update the ConcurrentHashMap with the min, mean, and max temperature values

## First Attempt

I was pretty familiar with Java's [ExecutorService](https://docs.oracle.com/javase/8/docs/api/java/util/concurrent/ExecutorService.html)
and [Collections API](https://docs.oracle.com/javase/8/docs/api/java/util/Collections.html)
but I didn't know if it was even possible to memory map a file in Java.
Thankfully, after a quick consultation with ChatGPT, I come to find Java
provides [RandomAccessFile](https://docs.oracle.com/javase/8/docs/api/java/io/RandomAccessFile.html)
and [FileChannel](https://docs.oracle.com/javase/8/docs/api/java/nio/channels/FileChannel.html)
which can be used to memory map a file. Just what I was looking for!

### Putting It All Together

First up, memory mapping the file and setting up the HashMap:

```java
try (RandomAccessFile file = new RandomAccessFile(FILE, "r");
        FileChannel fileChannel = file.getChannel()) {

    long fileSize = fileChannel.size();
    ConcurrentHashMap<String, MeasurementAggregator> results = new ConcurrentHashMap<>();
    int processors = Runtime.getRuntime().availableProcessors();
    ExecutorService executor = Executors.newFixedThreadPool(processors);
}
```

Setting up the container to hold the measurements:

```java
private static class MeasurementAggregator {
    double min = Double.POSITIVE_INFINITY;
    double max = Double.NEGATIVE_INFINITY;
    double sum;
    long count;

    void add(double value) {
        min = Math.min(min, value);
        max = Math.max(max, value);
        sum += value;
        count++;
    }
}
```

Then chunk the file and send it to the thread pool for processing:

```java
long position = 0;
while (position < fileSize) {
    long chunkSize = Math.min(CHUNK_SIZE, fileSize - position);
    MappedByteBuffer buffer = fileChannel.map(FileChannel.MapMode.READ_ONLY, position, chunkSize);

    Future<?> future = executor.submit(() -> processChunk(buffer, results));
    futures.add(future);

    position += chunkSize;
    position = adjustToLineEnd(file, position, fileSize);
}
```

Finally, I process the chunk and update the ConcurrentHashMap:

```java
private static void processChunk(MappedByteBuffer buffer,
        ConcurrentHashMap<String, MeasurementAggregator> results) {
    StringBuilder line = new StringBuilder();
    while (buffer.hasRemaining()) {
        char c = (char) buffer.get();
        if (c == '\n') {
            processLine(line.toString(), results);
            line.setLength(0);
        }
        else {
            line.append(c);
        }
    }
    if (line.length() > 0) {
        processLine(line.toString(), results);
    }
}

private static void processLine(String line,
        ConcurrentHashMap<String, MeasurementAggregator> results) {
    String[] parts = line.split(";");
    if (parts.length != 2) {
        return;
    }

    try {
        String station = parts[0];
        double value = Double.parseDouble(parts[1]);

        results.compute(
                station,
                (_, v) -> {
                    if (v == null)
                        v = new MeasurementAggregator();
                    v.add(value);
                    return v;
                });
    }
}
```

### JVM Settings

At my day job, I've built many Java services both large and small. I was
familiar with the process of tuning the JVM and garbage collection but have
rarely needed to do so. I went down the rabbit hole of JVM tuning and
performance optimization when I learned about [GraalVM](https://www.graalvm.org/)
and it's [native binary feature](https://www.graalvm.org/latest/reference-manual/native-image/)
that would compile Java to native machine code. I was excited to see if this
would provide an advantage over the standard JVM.

In addition to using a native GraalVM binary, I also wanted the JVM to use
all available system resources regardless of the hardware it was running on.
This is no easy task as you have to specify at runtime the maximum heap size.
Off to ChatGPT to write a script to calculate the required settings and
launch the program.

```sh
get_system_info() {
  if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    total_memory=$(free -m | awk '/^Mem:/ {print $2}')
    num_cores=$(nproc)
  elif [[ "$OSTYPE" == "darwin"* ]]; then
    total_memory=$(sysctl -n hw.memsize | awk '{print int($1/1024/1024)}')
    num_cores=$(sysctl -n hw.ncpu)
  else
    echo "Unsupported OS type: $OSTYPE"
    exit 1
  fi
}

# Function to determine optimal heap size and GC type
determine_optimal_settings() {
  # Set heap size to 90% of system memory and convert to integer
  MAX_HEAP_SIZE=$(echo "scale=0; ($total_memory * .9) / 1" | bc)M
  # Set min heap size to same as max heap size
  MIN_HEAP_SIZE=$MAX_HEAP_SIZE

  GC_TYPE="--gc=G1"

  # Output the determined settings
  echo "Optimal Settings:"
  echo "Max Heap Size: $MAX_HEAP_SIZE"
  echo "Min Heap Size: $MIN_HEAP_SIZE"
  echo "Garbage Collector Type: $GC_TYPE"

  JAVA_OPTS="--enable-preview -Xms$MIN_HEAP_SIZE -Xmx$MAX_HEAP_SIZE $GC_TYPE"
}

# Check if the native image exists
if [ -f ./image_calculateaverage_emersonmde ]; then
  echo "Running native image with optimal hardware settings..."

  # Get system info
  get_system_info

  # Determine optimal settings for native image
  determine_optimal_settings

  # Run the native image with determined settings
  time ./image_calculateaverage_emersonmde $JAVA_OPTS
else
  # Get system info
  get_system_info

  determine_optimal_settings

  # Output hardware and JVM settings
  echo "System Hardware Details:"
  echo "Number of CPU Cores: $num_cores"
  echo "Total System Memory: $total_memory MB"
  echo "Calculating averages using emersonmde with JVM options: '$JAVA_OPTS'"

  # Run the application in JVM mode
  time java $JAVA_OPTS --class-path target/average-1.0.0-SNAPSHOT.jar dev.morling.onebrc.CalculateAverage_emersonmde
fi
```

I also looked into the different garbage collector implementations and took
note of the [G1 garbage collector](https://docs.oracle.com/en/java/javase/17/gctuning/garbage-first-g1-garbage-collector1.html#GUID-ED3AB6D3-FD9B-4447-9EDF-983ED2F7A573).
It was designed to provide a high throughput and low latency by using multiple
threads to perform the garbage collection concurrently with the application
threads. Thankfully this is already set as the default in newer versions of
GraalVM.

### The Results

I eagerly ran the program and waited for the results. The first run finished
in just 79 seconds. I thought for sure this was blazing fast and went to the
leaderboard to see how my solution stacked up to the competition. Turns out,
while this was much faster than the slowest entry at over 4 minutes, it was
near the end at 44th out of 55 entries. The first place entry was reported
at a mere 6 seconds. Granted this was likely benchmarked on much better
hardware that wasn't running IntelliJ, I knew I had to step up my game to even
be in the same league.

## Attempt #2

I was well aware of the vast performance difference between some of the Java
APIs despite them doing the same thing. I thought maybe it would be faster
to sequentially parse each line instead of using `String.split`. I also
assumed having each thread process a local region of the file instead of
passing in the entire buffer would be faster.

```java
public static List<Optional<Map<String, double>>> processBuffer(MappedByteBuffer buffer) {
    String content = StandardCharsets.UTF_8.decode(buffer).toString();
    try (Stream<String> lines = content.lines()) {
        return lines.map(line -> {
                    int separatorIndex = line.indexOf(";");
                    if (separatorIndex == -1) {
                        return Optional.empty();
                    }

                    String station = line.substring(0, separatorIndex);
                    String valueString = line.substring(separatorIndex + 1);
                    if (valueString.isEmpty() || valueString.equals("-")) {
                        return Optional.empty();
                    }
                    try {
                        double value = Double.parseDouble(valueString);
                        return Optional.of(new AbstractMap.SimpleImmutableEntry<>(station, value));
                    } catch (NumberFormatException e) {
                        return Optional.empty();
                    }
                })
                .filter(Optional::isPresent)
                .collect(Collectors.toList());
    }
}
```

With these changes I reran the program a few more times and didn't see any
additional gains. Clearly the bottleneck was not with the reading of the
data or splitting the lines. It would have been easy to run this through a
profiler and see exactly what the problem was but who wants to spoil the
ending of this journey? It was time to dig deeper!

### A wild SIMD appears

SIMD, single instruction multiple data, is a feature of most modern CPUs that
executes the same operation on multiple data points in parallel (Figure 1).
Utilizing Java's [Vector API](https://docs.oracle.com/en/java/javase/17/docs/api/jdk.incubator.vector/jdk/incubator/vector/Vector.html),
a platform independent API that compiles to native SIMD instructions on
supported architectures. I expected to see a significant speed increase
by preforming the addition, min, and max in parallel.

![SIMD processing pipeline](./SIMD2.png 'Figure 1. SIMD Processing 
Pipeline By Vadikus - Own work, CC BY-SA 4.0')

In order to use the Vector API, the data must be copied into a vector by
using the [`DoubleVector.fromArray()`](<https://docs.oracle.com/en/java/javase/17/docs/api/jdk.incubator.vector/jdk/incubator/vector/DoubleVector.html#fromArray(jdk.incubator.vector.VectorSpecies,double%5B%5D,int)>)
method. Once the vector is created [`DoubleVector.reduceLanes()`](<https://docs.oracle.com/en/java/javase/17/docs/api/jdk.incubator.vector/jdk/incubator/vector/DoubleVector.html#reduceLanes(jdk.incubator.vector.VectorOperators.Associative)>)
can be used with an operation and optional mask that will reduce the vector
to a single value using the operation and data supplied. The species also
needs to be specified which tells the Vector API how many data lanes to use
which is dependent on the architecture.

```java
// Find the preferred species for the architecture
VectorSpecies<Double> SPECIES = DoubleVector.SPECIES_PREFERRED;

double min = Double.POSITIVE_INFINITY;
double max = Double.NEGATIVE_INFINITY;
double sum = 0;
int count = values.length;

int i = 0;
for (; i < values.length - SPECIES.length(); i += SPECIES.length()) {
    DoubleVector vector = DoubleVector.fromArray(SPECIES, values, i);
    min = Math.min(min, vector.reduceLanes(VectorOperators.MIN));
    max = Math.max(max, vector.reduceLanes(VectorOperators.MAX));
    sum += vector.reduceLanes(VectorOperators.ADD);
}
```

The next problem was getting all the temperature values for a weather
station into a single array. Since there is no way to know how many
temperature values a weather station would have a dynamic list of
temperature values would need to be maintained. I knew this would significantly
increase the memory usage and introduce additional overhead to copy the data
into the vector but was hoping the parallel processing would more than make up
for the difference.

### See What Sticks

In addition to SIMD, I thought this would be a great opportunity to try out
other new Java features from recent releases that boasted performance
improvements. Virtual Threads? Sure, why not. Records? Couldn't hurt.

Virtual threads are Java's implementation of green threads, a lightweight
thread that is managed by the JVM instead of the operating system. This
reduces the overhead of creating and managing threads and can improve
performance in I/O bound tasks by creating more blocking threads than the
operating system would allow. Also, the changes needed to use virtual threads
were dead simple. Just replace [`Executors.newFixedThreadPool()`](https://docs.oracle.com/javase/8/docs/api/java/util/concurrent/Executors.html#newFixedThreadPool-int-)
with [`Executors.newVirtualThreadPerTaskExecutor()`](<https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/Executors.html#newVirtualThreadPerTaskExecutor()>)
and the JVM handles the rest.

Records are a new feature in Java 16 that provide a compact syntax for
declaring classes that are transparent holders for immutable data. In
addition to reducing the amount of boilerplate code, records are designed to
be more memory efficient and faster than traditional classes. Sounds like a
win-win proposal to me.

```java
public record TemperatureRecord(String station, double temperature) {}
```

### Send It

Ready to be blown away, I ran the program and.. it was about the same, this
time around 63 seconds. This could easily be chalked up to a few extra
Firefox tabs open in the background meaning all of those changes likely had
little effect.

So what happened? Surely processing an entire array of temperature values in
parallel would be faster even with the overhead of copying the data. After
digging around I found that the preferred species for the Apple's M1
architecture only supports 2 data lanes for double values. This meant
that the Vector API was only processing 2 temperature values at a time, not
exactly the parallel processing I was hoping for.

## Back To The Basics

At this point I exhausted all the ideas I set out to test and started to
look at how other entries were able to process the file so quickly. The
[first place entry](https://github.com/gunnarmorling/1brc/blob/main/src/main/java/dev/morling/onebrc/CalculateAverage_royvanrijn.java)
at the time was able to process the file in 6 seconds and also made use of a
memory mapped file and a ConcurrentHashMap. However, their solution also made
heavy use of Java's `Unsafe` API that exposes many lower level operations that
are usually reserved for internal use in the JDK. It was also on the
deprecation path and would be removed in future versions.

However, one interesting thing I noticed was the use of Java's
[`Collection.parallelStream()`](https://docs.oracle.com/javase/8/docs/api/java/util/Collection.html#parallelStream--)
over the chunk ranges. I'm a huge fan of the Stream API but I initially
dismissed it assuming it would introduce additional overhead over the
traditional `ExecutorService`.

I also changed the way process `processChunk()` works. Instead of updating a
shared `ConcurrentHashMap` I had created a local `HashMap` for each thread and
merged them at the end. I was hoping this would reduce any lock contention
and expensive atomic operations that were needed to safely share the `Map`
between threads.

```java
long segmentSize = fileSize / processors;
String resultString = IntStream.range(0, processors + 2).parallel().mapToObj(i -> {
    final long start = i * segmentSize;
    final long end;
    try {
        end = (i < processors - 1) ? adjustToLineEnd(file, (i + 1) * segmentSize, fileSize) : fileSize;
    }
    catch (IOException e) {
        throw new RuntimeException(e);
    }

    // Submit a task to process each file segment
    Map<String, MeasurementAggregator> results = new HashMap<>();
    try {
        processChunk(fileChannel, start, end - start, results);
    }
    catch (IOException e) {
        throw new RuntimeException(e);
    }
    return results;
}).reduce(new ConcurrentHashMap<>(), (finalResults, individualResult) -> {
    mergeHashMaps(finalResults, individualResult);
    return finalResults;
})
.entrySet().parallelStream()
.map(entry -> {
    String station = entry.getKey();
    MeasurementAggregator aggregator = entry.getValue();
    double mean = aggregator.sum / aggregator.count;
    return String.format("%s=%.2f/%.2f/%.2f", station, aggregator.min, mean, aggregator.max);
})
.collect(Collectors.joining(", "));
```

### Make It So

With some hesitation, I ran the program and was surprised to see it finished
in almost half the time at 33 seconds. Overall I was pretty happy with the
result. I could spend many more hours trying to learn the deprecated
`Unsafe` API or adding significant complexity, unrolling loops, and avoiding
control structures and generic APIs for to squeeze out even more performance,
but I'll save that exploration for another day.

## Lessons Learned

It seems abundantly obvious in retrospect but optimal performance is much
more a function of good design and fundamentals than it is about clever
tricks and exotic APIs. Sure there are many tricks for getting more
performance out of a system, and they can be useful to know, but it is far
more important to understand what is happening on a lower level and avoiding
the common foot-guns that are so tempting to use. Oh, and just use a profiler,
it's much easier than pulling all levers!
