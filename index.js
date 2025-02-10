require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { createCanvas } = require("canvas");
const app = express();
const PORT = process.env.PORT || 3002;

app.use(express.json());

const frontendUrls = process.env.FRONTEND_URL.split(",");
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || frontendUrls.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  optionsSuccessStatus: 200,
};
app.use(cors(corsOptions));

const contributionsQuery = `query($userName: String!) {
  user(login: $userName) {
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks {
          contributionDays {
            contributionCount
            date
          }
        }
      }
    }
  }
}`;

async function fetchUserContributions(username) {
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    },
    body: JSON.stringify({
      query: contributionsQuery,
      variables: { userName: username },
    }),
  });

  if (!response.ok) {
    throw new Error(
      `GitHub API error for user ${username}: ${response.status}`
    );
  }

  const data = await response.json();
  return data;
}

function combineContributions(contributionsArray) {
  const combined = {
    dates: [],
    contributions: [],
  };

  const firstUserData = contributionsArray[0];
  firstUserData.weeks.forEach((week) => {
    week.contributionDays.forEach((day) => {
      combined.dates.push(day.date);
      combined.contributions.push(day.contributionCount);
    });
  });

  for (let i = 1; i < contributionsArray.length; i++) {
    let dayIndex = 0;
    contributionsArray[i].weeks.forEach((week) => {
      week.contributionDays.forEach((day) => {
        combined.contributions[dayIndex] += day.contributionCount;
        dayIndex++;
      });
    });
  }

  return combined;
}

function createContributionsImage(contributionsData, theme, usernames) {
  const SQUARE_SIZE = 10;
  const SQUARE_GAP = 2;
  const WEEK_WIDTH = SQUARE_SIZE + SQUARE_GAP;
  const CANVAS_WIDTH = 53 * WEEK_WIDTH;
  const CANVAS_HEIGHT = 7 * WEEK_WIDTH + 20; // Extra space for usernames

  const canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
  const ctx = canvas.getContext("2d");

  const getColor = (count, maxCount) => {
    const normalizedLevel = count / maxCount;
    const paletteIndex = Math.floor(
      (1 - normalizedLevel) * (theme.palette.length - 1)
    );
    return theme.palette[paletteIndex];
  };

  const maxContribution = Math.max(...contributionsData.contributions);

  contributionsData.contributions.forEach((count, index) => {
    const week = Math.floor(index / 7);
    const dayOfWeek = index % 7;

    const x = week * WEEK_WIDTH;
    const y = dayOfWeek * WEEK_WIDTH + 20;

    ctx.fillStyle = getColor(count, maxContribution);
    ctx.fillRect(x, y, SQUARE_SIZE, SQUARE_SIZE);
  });

  //usernames
  ctx.fillStyle = "#000";
  ctx.font = "16px Arial";
  ctx.fillText(`Usernames: ${usernames.join(", ")}`, 10, 15);

  return canvas;
}

app.get("/combined-contributions", async (req, res) => {
  try {
    const usernames = req.query.usernames.split(",");
    if (!usernames || usernames.length < 1) {
      return res
        .status(400)
        .json({ error: "At least one username is required" });
    }

    const contributionsPromises = usernames.map((username) =>
      fetchUserContributions(username)
    );
    const contributionsArray = await Promise.all(contributionsPromises);

    const contributionsDataArray = contributionsArray.map(
      (data) => data.data.user.contributionsCollection.contributionCalendar
    );

    const combinedData = combineContributions(contributionsDataArray);

    const theme = {
      themeName: "Forest",
      palette: ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39"],
    };
    const canvas = createContributionsImage(combinedData, theme, usernames);

    res.setHeader("Content-Type", "image/png");
    canvas.createPNGStream().pipe(res);
  } catch (error) {
    console.error("Error processing contributions:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/contributions", async (req, res) => {
  try {
    if (!req.query.username) {
      return res.status(400).json({ error: "Username is required" });
    }
    const data = await fetchUserContributions(req.query.username);
    res.json(data);
  } catch (err) {
    console.error("Error fetching contributions:", err);
    throw err;
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
