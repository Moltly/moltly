// Post-import script to derive fields and create indexes for species collection
// Usage: mongosh --port <port> <db> --file species_post_import.js

// Ensure required string fields exist
db.species.updateMany({}, [
  {
    $set: {
      genus: { $ifNull: ["$genus", ""] },
      species: { $ifNull: ["$species", ""] },
      subspecies: { $ifNull: ["$subspecies", ""] },
    },
  },
  {
    $set: {
      fullName: {
        $trim: {
          input: {
            $concat: [
              "$genus",
              " ",
              "$species",
              { $cond: [{ $gt: [{ $strLenCP: "$subspecies" }, 0] }, { $concat: [" ", "$subspecies"] }, ""] },
            ],
          },
        },
      },
    },
  },
  { $set: { fullNameLC: { $toLower: "$fullName" } } },
]);

db.species.createIndex({ fullNameLC: 1 });

// Re-merge approved custom suggestions that are not part of the CSV import.
// This preserves admin-approved entries across CSV refreshes.
db.species_suggestions
  .find(
    { status: "approved" },
    {
      _id: 0,
      fullName: 1,
      fullNameLC: 1,
      genus: 1,
      species: 1,
      subspecies: 1,
      family: 1,
    }
  )
  .forEach((doc) => {
    const fullName = (doc.fullName || "").trim();
    const fullNameLC = (doc.fullNameLC || fullName.toLowerCase()).trim();
    if (!fullName || !fullNameLC) return;

    db.species.updateOne(
      { fullNameLC },
      {
        $setOnInsert: {
          fullName,
          fullNameLC,
          genus: doc.genus || null,
          species: doc.species || null,
          subspecies: doc.subspecies || null,
          family: doc.family || null,
        },
      },
      { upsert: true }
    );
  });

// Print a quick sample for sanity
printjson(db.species.find({}, { _id: 0, fullName: 1 }).limit(3).toArray());
