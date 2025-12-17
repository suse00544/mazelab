# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Maze Lab is a recommendation system research platform that simulates a Xiaohongshu (Little Red Book/RED) style content feed. It uses AI-powered recommendation strategies to study user behavior and personalization.

## Development Commands

```bash
# Install dependencies
npm install                      # Frontend dependencies
cd server && npm install         # Backend dependencies
cd crawler && pip install -r requirements.txt  # Python crawler dependencies

# Start all services for development (requires 3 terminals)
npm run dev                      # Frontend: Vite dev server on port 5173
node server/index.js             # Backend: Express API on port 3001
cd crawler && python main.py     # Crawler: FastAPI on port 8000

# Build for production
npm run build
NODE_ENV=production node server/index.js  # Serves both API and built frontend on port 5000
```

## Architecture

### Three-Service Architecture
1. **Frontend** (React + TypeScript + Vite): Single-page app at `/` proxied through Vite to port 5173
2. **Backend** (Express + SQLite): REST API at `/api/*` on port 3001
3. **Crawler** (Python FastAPI + Playwright): Xiaohongshu scraping service at port 8000

### Key Data Flow
- Frontend calls `/api/*` endpoints (proxied to backend via vite.config.ts)
- Backend proxies `/api/xhs/*` requests to the Python crawler service
- Crawler uses Playwright browser automation to scrape Xiaohongshu data
- All content stored in `server/data/maze_lab.sqlite`

### Frontend Structure
```
App.tsx                    # Main app with user/experiment state management
pages/
  Feed.tsx                 # Main content feed with swipe interaction
  Admin.tsx                # Admin panel for content management
  Dashboard.tsx            # Analytics dashboard
components/
  ArticleCard.tsx          # Content card display
  ArticleView.tsx          # Full article detail view
  ConfigModal.tsx          # 4-stage prompt configuration UI
services/
  db.ts                    # API client wrapper for all backend calls
  geminiService.ts         # Gemini AI 4-stage recommendation pipeline
  defaultPrompts.ts        # Default prompts for each recommendation stage
  xhsService.ts            # Xiaohongshu crawler API client
  autoCrawlService.ts      # Automated keyword-based crawling
```

### Backend API Groups (server/index.js)
- `/api/articles` - Content CRUD
- `/api/interactions` - User behavior logging
- `/api/experiments` - Experiment configuration
- `/api/sessions` - Recommendation session history
- `/api/xhs/*` - Proxied Xiaohongshu crawler endpoints
- `/api/ai/*` - Gemini AI endpoints
- `/api/jina/*` - Jina AI web reader integration

### Crawler Endpoints (crawler/main.py)
- `POST /search` - Search Xiaohongshu by keyword
- `POST /note/detail` - Get note details by ID
- `POST /user/notes` - Get user's published notes
- `POST /comments` - Get note comments

## Environment Variables

Required in `.env.local`:
```
GEMINI_API_KEY=your_key_here
JINA_API_KEY=your_key_here  # Optional, for Jina web reader
```

## Database Schema

Main tables in SQLite (server/database.js):
- `articles` - Content pool with Xiaohongshu-compatible fields
- `interactions` - User behavior (clicks, dwell time, likes, favorites)
- `experiments` - Per-user experiment configurations with 4-stage prompts
- `sessions` - Recommendation batches with AI strategies
- `onboarding_questions` - Cold-start questionnaire configuration
- `user_profiles` - User demographics and interests

## Type System

Core types defined in `types.ts`:
- `Article` - Xiaohongshu note structure (uses `tag_list`, `desc`, `user_nickname`, `liked_count` etc.)
- `Interaction` - User behavior record with `articleContext` snapshot
- `Experiment` - Experiment config with `stage1-4_custom_prompt` and `recommendation_config`
- `Stage1UserProfile` - User interest hierarchy (core/edge/potential interests)
- `Stage2RecallResult` - Multi-channel recall results (core/edge/hot/explore channels)
- `Stage3FilterResult` - Quality filtering with scores breakdown
- `Stage4RankResult` - Final ranking with slot types and diversity metrics

## 4-Stage Recommendation Pipeline

The recommendation system uses a 4-stage AI pipeline (in `geminiService.ts`):

1. **Stage 1 - User Profile Analysis** (`analyzeUserProfile`)
   - Builds interest hierarchy: core, edge, potential interests
   - Analyzes content preferences (depth, style, length)
   - Determines if new content search is needed

2. **Stage 2 - Multi-Channel Recall** (`multiChannelRecall`)
   - 4 channels with configurable ratios (default: 40% core, 30% edge, 20% hot, 10% explore)
   - Ensures diversity by recalling from different interest areas

3. **Stage 3 - Quality Filter** (`qualityFilter`)
   - Scores content on: content_quality, relevance, freshness
   - Filters: low_quality, already_viewed, too_similar, off_topic

4. **Stage 4 - Final Ranking** (`finalRanking`)
   - Position strategy: slots 1-2 (core), 3-4 (edge), 5 (explore)
   - MMR-style diversity optimization
   - Outputs `category_distribution` as array format: `[{category, count}]`

Default prompts are in `services/defaultPrompts.ts` with system (locked) + user (customizable) parts.

## Experiment Modes

- **Solo Mode** (`mode: 'solo'`): Each experiment has its own personal content library
- **Community Mode** (`mode: 'community'`): Shares content from community library

Content libraries are filtered by `library_type` ('personal' | 'community') and `experiment_id`.
