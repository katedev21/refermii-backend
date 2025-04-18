// reddit-scraper.js
require('dotenv').config();
const axios = require('axios');
const mongoose = require('mongoose');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Parse command line arguments
const parseArgs = () => {
    const args = process.argv.slice(2);
    let subredditUrl = null;

    if (args.length === 0) {
        console.error('Error: Subreddit URL is required');
        console.log('Usage: node reddit-scraper.js https://www.reddit.com/r/referralcodes/');
        process.exit(1);
    }

    subredditUrl = args[0];

    // Extract subreddit name from URL
    try {
        const parsedUrl = new URL(subredditUrl);
        const pathParts = parsedUrl.pathname.split('/').filter(Boolean);

        // Check if the URL is a valid subreddit URL
        if (pathParts.length < 2 || pathParts[0] !== 'r') {
            throw new Error('Invalid subreddit URL');
        }

        const subreddit = pathParts[1];
        return {
            subreddit,
            fullUrl: subredditUrl
        };
    } catch (error) {
        console.error(`Error parsing subreddit URL: ${error.message}`);
        console.log('Usage: node reddit-scraper.js https://www.reddit.com/r/referralcodes/');
        process.exit(1);
    }
};

// Get subreddit info from command line
const { subreddit, fullUrl } = parseArgs();
console.log(`Targeting subreddit: r/${subreddit}`);

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));

// Import Referral model
const Referral = require('../models/Referral');

// Initialize Google Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

// Configuration
const REDDIT_API_BASE_URL = 'https://www.reddit.com';
const MAX_PAGES = parseInt(process.env.MAX_PAGES || 5);
const POSTS_PER_PAGE = parseInt(process.env.POSTS_PER_PAGE || 25);
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';
const GEMINI_BATCH_SIZE = parseInt(process.env.GEMINI_BATCH_SIZE || 10); // Number of posts to process in parallel
const GEMINI_RATE_LIMIT = parseInt(process.env.GEMINI_RATE_LIMIT || 15); // Requests per minute
const BATCH_DELAY = Math.ceil(60000 / GEMINI_RATE_LIMIT); // Milliseconds between requests to stay under rate limit

/**
 * Get posts from the subreddit
 * @param {string} after - Reddit pagination parameter
 * @param {number} limit - Number of posts to fetch
 * @returns {Promise<Object>} - Array of posts and pagination token
 */
async function getSubredditPosts(after = null, limit = POSTS_PER_PAGE) {
    try {
        let url = `${REDDIT_API_BASE_URL}/r/${subreddit}.json?limit=${limit}`;
        if (after) {
            url += `&after=${after}`;
        }

        const response = await axios.get(url, {
            headers: {
                'User-Agent': USER_AGENT
            }
        });

        if (!response.data || !response.data.data || !response.data.data.children) {
            console.error('Unexpected response structure:', response.data);
            return { posts: [], after: null };
        }

        return {
            posts: response.data.data.children.map(child => child.data),
            after: response.data.data.after
        };
    } catch (error) {
        console.error('Error fetching subreddit posts:', error.message);
        return { posts: [], after: null };
    }
}

/**
 * Scrape multiple pages of Reddit posts and return all posts
 * @param {number} maxPages - Maximum number of pages to scrape
 * @returns {Promise<Array>} - Array of all scraped posts
 */
async function scrapeAllPosts(maxPages = MAX_PAGES) {
    let after = null;
    let pageCount = 0;
    let allPosts = [];

    console.log(`Starting to scrape r/${subreddit}...`);

    while (pageCount < maxPages) {
        pageCount++;
        console.log(`\nScraping page ${pageCount}...`);

        const { posts, after: nextAfter } = await getSubredditPosts(after);
        if (posts.length === 0) {
            console.log('No more posts to process');
            break;
        }

        console.log(`Found ${posts.length} posts on page ${pageCount}`);
        allPosts = allPosts.concat(posts);

        after = nextAfter;
        if (!after) {
            console.log('No more pages available');
            break;
        }

        // Add delay between requests to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log(`\nScraping complete. Total posts collected: ${allPosts.length}`);
    return allPosts;
}

/**
 * Extract post details using Gemini
 * @param {Object} post - Reddit post object
 * @returns {Promise<Object>} - Extracted referral data
 */
async function extractPostDetails(post) {
    try {
        // Combine title and selftext for analysis
        const content = `
Title: ${post.title}
Content: ${post.selftext || ''}
URL: ${post.url || ''}
    `;

        const prompt = `
Extract referral code information from this Reddit post from r/${subreddit}. 
Return a JSON object with these fields (leave empty if not found):
- brand: The company/service name the referral is for
- code: Any referral or promo code (just the code, not the full phrase "use code XYZ")
- link: Any referral link in the post
- tags: Array of relevant tags (e.g., "food delivery", "cryptocurrency", "finance")
- expirationDate: Expiration date if mentioned (in YYYY-MM-DD format, or null if not specified)

Post data:
${content}

Only return valid JSON with no other text.
`;

        const result = await model.generateContent(prompt);
        const responseText = result.response.text();

        // Parse JSON from response
        let extractedData;
        try {
            // Remove any non-JSON text before parsing
            const jsonMatch = responseText.match(/(\{[\s\S]*\})/);
            if (jsonMatch && jsonMatch[0]) {
                extractedData = JSON.parse(jsonMatch[0]);
            } else {
                throw new Error('No valid JSON found in response');
            }
        } catch (jsonError) {
            console.error('Error parsing Gemini response as JSON:', jsonError);
            console.log('Raw response:', responseText);
            return null;
        }

        // Set default expiration date if not provided (30 days from now)
        if (!extractedData.expirationDate) {
            const defaultExpiry = new Date();
            defaultExpiry.setDate(defaultExpiry.getDate() + 30);
            extractedData.expirationDate = defaultExpiry.toISOString().split('T')[0];
        }

        return {
            ...extractedData,
            postDate: new Date(post.created_utc * 1000),
            redditId: post.id,
            redditPermalink: post.permalink
        };
    } catch (error) {
        console.error('Error extracting post details with Gemini:', error.message);
        return null;
    }
}

/**
 * Process a batch of posts with Gemini with rate limiting
 * @param {Array} posts - Array of Reddit posts to process
 * @returns {Promise<Array>} - Array of extracted referral data
 */
async function processBatchWithGemini(posts) {
    const results = [];
    let processedCount = 0;

    console.log(`Processing batch of ${posts.length} posts with Gemini...`);

    for (const post of posts) {
        processedCount++;
        console.log(`Processing post ${processedCount}/${posts.length}: ${post.title.substring(0, 50)}...`);

        // Process with Gemini
        const referralData = await extractPostDetails(post);

        if (referralData) {
            results.push(referralData);
            console.log(`Successfully extracted data for ${referralData.brand || 'unknown brand'}`);
        } else {
            console.log('Failed to extract referral data from this post');
        }

        // Add delay between requests to stay under rate limit
        if (processedCount < posts.length) {
            console.log(`Waiting ${BATCH_DELAY}ms before next request (rate limit: ${GEMINI_RATE_LIMIT} RPM)...`);
            await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
        }
    }

    return results;
}

/**
 * Save referral data to MongoDB
 * @param {Object} referralData - Extracted referral data
 * @returns {Promise<boolean>} - Success status
 */
async function saveReferralToDb(referralData) {
    if (!referralData || !referralData.brand || (!referralData.code && !referralData.link)) {
        return false;
    }

    try {
        // Check if this referral already exists
        const isDuplicate = await Referral.checkDuplicate(referralData.brand, referralData.code);
        if (isDuplicate) {
            console.log(`Skipping duplicate referral for ${referralData.brand}`);
            return false;
        }

        // Create and save new referral using the original model schema
        const referral = new Referral({
            brand: referralData.brand,
            code: referralData.code,
            link: referralData.link,
            tags: referralData.tags || [],
            postDate: referralData.postDate,
            expirationDate: new Date(referralData.expirationDate),
            isValid: true,
            lastValidated: new Date()
        });

        await referral.save();
        console.log(`Saved referral for ${referralData.brand}`);
        return true;
    } catch (error) {
        console.error('Error saving referral to database:', error.message);
        return false;
    }
}

/**
 * Process posts in batches to respect Gemini rate limits
 * @param {Array} allPosts - Array of all scraped Reddit posts
 * @returns {Promise<number>} - Number of referrals saved
 */
async function processPostsInBatches(allPosts) {
    let totalSaved = 0;
    let processedCount = 0;

    // Process posts in batches to respect rate limits
    for (let i = 0; i < allPosts.length; i += GEMINI_BATCH_SIZE) {
        const batch = allPosts.slice(i, i + GEMINI_BATCH_SIZE);
        console.log(`\nProcessing batch ${Math.floor(i / GEMINI_BATCH_SIZE) + 1} of ${Math.ceil(allPosts.length / GEMINI_BATCH_SIZE)}`);

        // Process the current batch
        const processedBatch = await processBatchWithGemini(batch);

        // Save valid referrals to database
        for (const referralData of processedBatch) {
            const saved = await saveReferralToDb(referralData);
            if (saved) totalSaved++;
        }

        processedCount += batch.length;
        console.log(`Progress: ${processedCount}/${allPosts.length} posts processed, ${totalSaved} referrals saved`);

        // Add delay between batches
        if (i + GEMINI_BATCH_SIZE < allPosts.length) {
            console.log('Waiting 5 seconds before processing next batch...');
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }

    return totalSaved;
}

/**
 * Main function to run the scraper
 */
async function main() {
    try {
        // Step 1: Scrape all posts from Reddit
        const allPosts = await scrapeAllPosts();

        if (allPosts.length === 0) {
            console.log('No posts found. Exiting.');
            return;
        }

        // Step 2: Process posts in batches with Gemini
        const totalSaved = await processPostsInBatches(allPosts);

        // Step 3: Report results
        console.log(`\nScraping and processing complete.`);
        console.log(`Total posts processed: ${allPosts.length}`);
        console.log(`Total referrals saved: ${totalSaved}`);

    } catch (error) {
        console.error('Script error:', error);
    } finally {
        // Allow some time for pending operations to complete before exiting
        setTimeout(() => {
            console.log('Script completed');
            process.exit(0);
        }, 1000);
    }
}

// Run the scraper
main();