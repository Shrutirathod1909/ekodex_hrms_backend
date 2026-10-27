const path = require("path");

// const getRelativePathFromApi = (file) => {
//   // Normalize the path to handle consistent separators
//   const fullPath = path.normalize(file.path);
//   console.log("fullPath", fullPath);
//   // Split the path into an array of segments
//   const segments = fullPath.split(path.sep);

//   // Find the index of the "api" folder
//   const index = segments.indexOf("api");

//   if (index !== -1) {
//     // Join from "api" onwards, then replace all backslashes with forward slashes
//     return segments.slice(index).join("/").replace(/\\/g, "/");
//   }

//   return null;
// };

const getRelativePathFromApi = (file) => {
  // Normalize the path to handle consistent separators
  const fullPath = path.normalize(file.path);

  // Split the path into an array of segments
  const segments = fullPath.split(path.sep);

  // Find the index of the "api" folder
  const index = segments.indexOf("api");

  if (index !== -1 && index + 1 < segments.length) {
    // Join everything after "api" (e.g., idcards/E2191.pdf)
    return segments
      .slice(index + 1)
      .join("/")
      .replace(/\\/g, "/");
  }

  return null;
};

module.exports = {
  getRelativePathFromApi,
};
