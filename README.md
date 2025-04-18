# ReferMii - Referral Code Management Application

ReferMii is a full-stack application that allows users to find, share, and manage referral codes from various brands and services. The application includes a Node.js/Express backend with MongoDB database and a React frontend.

## Features

- Browse available referral codes
- Search and filter by brand or tags
- Copy referral codes and links with a single click
- Add new referral codes
- Dark/light theme toggle
- Responsive design for all devices
- Automatic code validation and expiration

## Project Structure

The project is divided into two main parts:

### Backend

```
backend/
  ├── models/             # MongoDB Mongoose models
  │   └── Referral.js     # Referral schema and model
  ├── .env                # Environment variables
  ├── package.json        # Dependencies and scripts
  ├── server.js           # Express server setup
  └── reddit-scraper.js   # Script to scrape referral codes from Reddit
```

### Frontend

```
frontend/
  ├── public/             # Static files
  ├── src/
  │   ├── components/     # Reusable UI components
  │   │   ├── Header.js
  │   │   ├── Footer.js
  │   │   └── ReferralCard.js
  │   ├── pages/          # Page components
  │   │   ├── Home.js
  │   │   └── AddReferral.js
  │   ├── context/        # React context
  │   │   └── ThemeContext.js
  │   ├── services/       # API services
  │   │   └── apiService.js
  │   ├── App.js          # Main app component
  │   ├── App.css         # Global styles
  │   └── index.js        # Entry point
  ├── .env.local          # Environment variables
  └── package.json        # Dependencies and scripts
```

## Setup Instructions

### Backend Setup

1. Navigate to the backend directory
   ```
   cd backend
   ```

2. Install dependencies
   ```
   npm install
   ```

3. Create a `.env` file with the following variables:
   ```
   MONGODB_URI=mongodb://localhost:27017/refermii
   PORT=5000
   GEMINI_API_KEY=your_gemini_api_key
   ```

4. Start the server
   ```
   npm start
   ```

5. (Optional) Run the Reddit scraper to populate your database
   ```
   node reddit-scraper.js
   ```

### Frontend Setup

1. Navigate to the frontend directory
   ```
   cd frontend
   ```

2. Install dependencies
   ```
   npm install
   ```

3. Create a `.env.local` file with the following variables:
   ```
   REACT_APP_API_URL=http://localhost:5000/api
   ```

4. Start the development server
   ```
   npm start
   ```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/referrals` | GET | Get all referrals with optional filters |
| `/api/referrals` | POST | Add a new referral |
| `/api/referrals/:id` | GET | Get a specific referral by ID |
| `/api/referrals/:id` | PUT | Update a referral |
| `/api/referrals/:id` | DELETE | Delete a referral |

## Technologies Used

### Backend
- Node.js
- Express.js
- MongoDB with Mongoose
- Axios for HTTP requests
- Google Gemini AI for code extraction
- Express Validator for input validation

### Frontend
- React
- React Router for navigation
- Axios for API requests
- CSS for styling (no external UI libraries)

## Future Enhancements

- User authentication
- Ability to upvote/downvote referral codes
- Admin dashboard for managing codes
- Reporting system for expired or invalid codes
- Social sharing capabilities
- Email notifications for expiring codes

## License

MIT