# Learning Log

## Day 1 - 37 minutes

### What I worked on
- Read and analyzed the full exercise brief
- Read the Agentic Vision announcement to understand what Tier 2 actually requires
- Compared Next.js fullstack vs separate FastAPI backend
- Planned about the work timeline - roughly 3–4 hrs/day across the week to hit the 15–20 hr estimate

### Decisions
- Chose Next.js fullstack to reduce deployment complexity and avoid CORS issues

### Constraints
- Currently employed full-time, so hours are split across mornings and evenings
  rather than in one block

## Day 2 (2 hrs and 40 minutes)

### What I worked on
- Setup Next.js project with tailwind for styling
- Created github repo and made the first commit
- Built the upload page with image picker, question input, submit button, loading and error state
- Built the API route that receives the image and question, converts the image
  to base64, and sends both to Gemini
- Got an API key from Google AI Studio and stored it in .env.local
- Created env file to store securely my api key
- 

### Decisions:
- Used FormData instead of JSON for the request because the image is binary —
  you can't cleanly put raw bytes in a JSON string without encoding it first,
  and that's the server's job not the browser's
- Image is sent as base64 inline_data to Gemini, keeps the app stateless,
  no file storage needed
- API key only lives in route.ts via process.env, never referenced in any
  client file, never prefixed with NEXT_PUBLIC_

### Constraints
- Hit a bug where the image wasn't reaching the server, turned out I was
  setting Content-Type to application/json manually while sending FormData,
  which broke the multipart boundary. Removing that header fixed it.

### What I used AI for:
- Asked Claude to compare Next.js-only vs Next.js + FastAPI per tier before
  committing to a stack
- Used Claude to generate the initial skeleton for route.ts and page.tsx
- Described the FormData + Content-Type bug to Claude and got the diagnosis
- Asked Claude what 0x00000000 meant in the curl response
- Asked Claude to explain the Gemini request shape, why parts, why inline_data,
  why the array structure.

### How I validated:
- Ran curl against the Gemini API manually before writing any TypeScript so I
  knew what the request and response actually looked like
- After the FormData bug, traced through the fix line by line before accepting
  it, understood why it worked.


## Day 3
**Hours:** 2 h 28m

### What I worked on
Added image compression using sharp before sending to Gemini,
improved the AI instruction prompt, and cleaned up error handling
with try/catch.

### What I got stuck on
I added sharp compression expecting it to reduce Gemini token usage.
Checked the logs and both before and after showed identical image
tokens, 1,089. Spent time reading the Gemini media resolution docs
and learned that the default resolution is "high" which uses up to 1,120 tokens
per image. So compression doesn't reduce token count — the real
benefit is transfer latency and payload size.

Also hit a 503 from Gemini mid-testing — "high demand, try again later".
Not a code problem, just preview model capacity limits during peak hours.
Waited and retried.

### What I used Claude for
- Suggested using sharp for server-side compression
- Explained the resize fit options (inside vs cover vs contain)
- Helped me understand why 85% JPEG quality is the standard sweet spot

### How I validated it
Logged original and compressed size on every request, 
Then compared the Gemini response logs before and after compression
to check actual token usage.

### Decisions and trade-offs
- Always convert to JPEG at 85%
- Kept mediaResolution at default (high, 1089 tokens) for now.
  Could drop to medium (560 tokens) to cut token cost but would
  hurt accuracy for serial number reading and fine detail tasks.
- Trimmed the AI instruction to a direct command.