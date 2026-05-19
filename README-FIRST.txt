BAG PROPERTY HOLDINGS LANDING SITE

This is a static portfolio landing page that links to the three individual BAG property websites.

Fast local start:
1. Open this folder in Terminal / PowerShell.
2. Run: npm install
3. Run: npm run dev
4. Open: http://localhost:3000

Local admin control:
1. Run: npm run admin:portal
2. Open: http://localhost:4175
3. Login with the starter local credentials in .env.local:
   username: admin
   password: admin123
4. Change .env.local before real use.

Admin functions included:
- Show or hide any property card from the public landing page
- Edit property title, summary, location, price, availability, and features
- Add the published URL for each property website
- Upload cover photos for property cards
- Upload up to 10 responsive gallery photos for each property card
- Remove property-gallery photos from the admin panel
- Upload a portfolio / hero image for the landing page
- Edit company headline, contact email, and public notice copy

Static deployment:
- Run: npm run build
- Deploy the generated out/ folder, or push to GitHub Pages using the included workflow.
