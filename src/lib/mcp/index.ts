import { defineMcp } from "@lovable.dev/mcp-js";
import searchMovies from "./tools/search-movies";
import recentMovies from "./tools/recent-movies";
import catalogStats from "./tools/catalog-stats";

export default defineMcp({
  name: "movie-bot-mcp",
  title: "Movie Bot MCP",
  version: "0.1.0",
  instructions:
    "Tools for the Movie Bot catalog. Use `search_movies` to find a movie by title, `recent_movies` to list newest additions, and `catalog_stats` for the total count.",
  tools: [searchMovies, recentMovies, catalogStats],
});