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

// Print a quick sample for sanity
printjson(db.species.find({}, { _id: 0, fullName: 1 }).limit(3).toArray());

