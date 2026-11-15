const compare = (left, right) => (left < right ? -1 : left > right ? 1 : 0);

// Partition the current inventory, not the historical profile: renamed and new
// files still run, while deleted historical entries cannot add tests to a job.
export function balanceTestFiles(files, count, durations) {
  if (!Number.isSafeInteger(count) || count < 1 || count > files.length) {
    throw new Error("shard count must be between one and the file count");
  }
  if (new Set(files).size !== files.length) {
    throw new Error("duplicate file in shard input");
  }
  const known = Object.values(durations);
  if (known.some((value) => !Number.isSafeInteger(value) || value <= 0)) {
    throw new Error("historical file durations must be positive milliseconds");
  }
  const fallback = known.length
    ? [...known].sort((left, right) => left - right)[
        Math.floor(known.length / 2)
      ]
    : 1000;
  const weight = (file) =>
    Object.hasOwn(durations, file) ? durations[file] : fallback;
  const groups = Array.from({ length: count }, () => ({ files: [], cost: 0 }));
  const ordered = [...files].sort(
    (left, right) => weight(right) - weight(left) || compare(left, right)
  );
  for (const file of ordered) {
    const target = groups.reduce((best, group) =>
      group.cost < best.cost ||
      (group.cost === best.cost && group.files.length < best.files.length)
        ? group
        : best
    );
    target.files.push(file);
    target.cost += weight(file);
  }
  return groups.map((group) => group.files);
}
