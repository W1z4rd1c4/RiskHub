# The Artisan’s Code: Developer Conventions in RiskHub

Code is read far more often than it is written. In RiskHub, we follow a set of conventions not just for consistency, but to ensure that any developer—now or three years from now—can step into the codebase and feel at home.

## Python: The Backend Dialect
Our backend is written in **Python**, following the `PEP 8` standard, but with a few unique organizational flourishes:

- **The Entry Points**: All API roads lead through `backend/app/api/v1/endpoints`. We keep our endpoints thin—they are the "Concierges" that greet the user and delegate work to the Services.
- **The Schemas**: We use **Pydantic** to define the shape of our data. It’s our first line of defense; if a piece of data doesn't look like its schema, it doesn't get past the front door.
- **The Language of Logic**: We follow Python’s natural naming conventions: `snake_case` for our variables and functions, and `PascalCase` for the classes that represent our concepts.

## TypeScript: The Frontend Grammar
On the frontend, we use **React** and **TypeScript**. Our style is clean and component-driven:

- **The Component Gallery**: Every UI element is a self-contained "Functional Component." If you need a button, you use a Button component. This ensures the app feels cohesive.
- **Strict Typing**: We avoid the use of `any`. By strictly defining our "Types," we ensure that the frontend and backend stay in perfect sync. If the backend says a Risk has an "id," the frontend knows exactly how to handle it.
- **Tailwind Utility**: We don't write generic CSS. We use **Tailwind utility classes** directly in our markup. This keeps our design system in our fingertips and ensures that components look identical regardless of where they are placed.

## The Shared Philosophy: "Explicit is Better Than Implicit"
We prefer code that tells a story.
- If a function is complex, we comment on the "Why," not just the "How."
- If we find a bug, we write a test for it before we fix it, ensuring it never returns.
- We use import aliases (like `@`) to keep our file paths clean and readable.

---
*Following these conventions is how we transition from "Writing Code" to "Crafting a Platform."*
