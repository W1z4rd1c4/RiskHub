# A Tour of the RiskHub Repository: Navigating the Map

Welcome to the layout of the Land. If you were to open the hood of RiskHub, you'd find a meticulously organized workshop. Let's walk through the main "Rooms" of our repository.

## The Backend Vault (`/backend`)
This is where the logic lives.
- **`app/api/v1`**: The "Customs Office." Every request from the outside world enters through here.
- **`app/models`**: The "Blueprints." This is where we define what a "Risk" or an "Administrator" looks like in the database.
- **`app/services`**: The "Specialists." If we need to generate a complex PDF or sync with a directory, we call a specialist service in this folder.
- **`alembic`**: The "Time Machine." This folder records every change we've ever made to the database structure, allowing us to roll forward or backward in time as needed.

## The Frontend Gallery (`/frontend`)
This is where the user experience is crafted.
- **`src/pages`**: The "Destinations." Each file here represents a whole screen the user can visit, like the Dashboard or the Risk Register.
- **`src/components`**: The "Lego Bricks." These are reusable UI elements—buttons, cards, and charts—that we snap together to build the pages.
- **`src/services`**: The "Couriers." These small modules are responsible for carrying messages to the backend and bringing responses back.
- **`src/contexts`**: The "Shared Memories." This is where the app remembers things across different pages, like who is currently logged in.

## The AD Emulator (`/AD Emulator`)
Think of this as a "Simulator Room." It's a completely separate mini-application used only for testing. It has its own frontend and backend, acting as a "Replica Directory" so we can test syncing large volumes of users without ever touching your real corporate data.

## The Planning Archive (`/.planning`)
This is the "Brain" of the project's history.
- **`phases`**: The journal of our journey, documenting every feature we've built from the first line of code to today.
- **`codebase`**: The technical maps and architectural diagrams you're reading right now.

## Important Utilities
- **`docker-compose.yml`**: The "Power Button." One command here spins up the entire database environment.
- **`generate_pdf.py`**: A dedicated workbench for refining our PDF export logic.
- **`scripts/`**: A collection of "Swiss Army Knives"—small tools for seeding initial data, cleaning the database, or verifying integrations.

---
*Every file has a home, and every home has a purpose. This structure ensures that no matter how big RiskHub gets, any developer can find their way around.*
