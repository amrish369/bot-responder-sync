# Architecture rules

- Provide browser backend configuration through public-only Vite definitions, preferring environment values over checked-in public fallbacks; this keeps published auth working when sandbox environment files are absent without modifying managed clients or exposing private credentials.