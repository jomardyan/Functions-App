<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1cPCHI-AcZBq2nRlTEEh5XSRJkwjs-4UZ

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## First-time installation wizard

The app now includes a first-time onboarding flow for administrators:

- **Production mode**: full setup for admin + database configuration
- **Demo mode**: quick test mode (minimal required input) with optional DB configuration
- **Development mode**: local/dev setup with configurable admin and DB

### Database setup options in onboarding

- **SQLite (local file path)**
- **MySQL**
- **PostgreSQL**

## Screenshots

### Onboarding wizard (first-time setup)

![Onboarding Wizard](https://github.com/user-attachments/assets/b6fb97fb-edd9-4b00-be40-c5eb4bd0d7ee)
