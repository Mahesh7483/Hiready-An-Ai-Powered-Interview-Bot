# 🎯 Setup Checklist - Voice Interview with Deepgram AI

## Before You Start

- [ ] Node.js and npm installed
- [ ] Project dependencies installed (`npm install`)
- [ ] Internet connection available

## Step 1: Get API Keys (10 minutes)

### Deepgram API Key
- [ ] Visit https://console.deepgram.com/
- [ ] Create account or sign in
- [ ] Navigate to API Keys section
- [ ] Click "Create a New API Key"
- [ ] Copy the API key
- [ ] Save it somewhere safe

### Groq API Key (Llama 3.1 70B)
- [ ] Visit https://console.groq.com/
- [ ] Create account or sign in
- [ ] Click "Create API Key"
- [ ] Give it a name (e.g., "Voice Interview")
- [ ] Copy the API key
- [ ] Save it somewhere safe

## Step 2: Configure Environment (2 minutes)

- [ ] Open `.env` file in project root
- [ ] Paste Deepgram API key after `VITE_DEEPGRAM_API_KEY=`
- [ ] Paste Groq API key after `VITE_GROQ_API_KEY=`
- [ ] Save the file
- [ ] **Important:** Make sure there are no spaces or quotes

Example:
```
VITE_DEEPGRAM_API_KEY=abc123xyz...
VITE_GROQ_API_KEY=gsk_abc123...
```

## Step 3: Start Development Server (1 minute)

- [ ] Stop dev server if running (Ctrl+C)
- [ ] Run: `npm run dev`
- [ ] Wait for server to start
- [ ] Note the URL (usually http://localhost:5173)

## Step 4: Test in Browser (5 minutes)

### Initial Setup
- [ ] Open browser (Chrome or Edge recommended)
- [ ] Navigate to the app URL
- [ ] Go to Voice Interview page

### Microphone Permission
- [ ] Click microphone button
- [ ] Browser asks for microphone permission
- [ ] Click "Allow" or "Yes"
- [ ] Check if green recording indicator appears

### Test Recording
- [ ] AI should ask opening question
- [ ] Click microphone button
- [ ] Speak clearly: "I am a software developer"
- [ ] Watch transcript appear in real-time
- [ ] Wait 2 seconds of silence
- [ ] Recording should auto-stop
- [ ] AI should respond with follow-up question

### Verify Features
- [ ] Real-time transcript displays
- [ ] Recording auto-stops after silence
- [ ] AI generates response
- [ ] Response is displayed
- [ ] Response is spoken (if speakers on)
- [ ] Can click mic to respond again

## Step 5: Verify Everything Works

### Visual Checks
- [ ] Recording button changes color when active
- [ ] "Recording..." text appears
- [ ] Live transcript shows your words
- [ ] "Processing..." message appears
- [ ] AI response appears in blue box
- [ ] Progress bar updates

### Audio Checks
- [ ] Microphone captures your voice
- [ ] Transcript matches what you said
- [ ] AI voice speaks response (optional)

### Functionality Checks
- [ ] Can start/stop recording manually
- [ ] Auto-stop works after 2 seconds silence
- [ ] AI asks relevant follow-up questions
- [ ] Can end interview anytime
- [ ] No console errors

## Troubleshooting

### If microphone doesn't work:
- [ ] Check browser permissions (lock icon in address bar)
- [ ] Try refreshing page
- [ ] Try different browser
- [ ] Check system microphone settings

### If no transcription appears:
- [ ] Verify Deepgram API key in `.env`
- [ ] Check console for errors (F12)
- [ ] Restart dev server
- [ ] Speak louder/clearer

### If AI doesn't respond:
- [ ] Verify Groq API key in `.env`
- [ ] Check console for errors (F12)
- [ ] Verify API key is valid on Groq console
- [ ] Check internet connection
- [ ] Verify rate limits not exceeded (30 req/min)

### If server won't start:
- [ ] Check `.env` file syntax (no spaces, no quotes)
- [ ] Restart terminal/VS Code
- [ ] Run `npm install` again
- [ ] Check for port conflicts

## Common Error Messages

| Error | Solution |
|-------|----------|
| "API keys not configured" | Add keys to `.env` and restart server |
| "Microphone access denied" | Allow microphone in browser settings |
| "Failed to start interview" | Check Groq API key is valid |
| "No speech detected" | Speak louder or check microphone |
| "Transcription error" | Check Deepgram API key is valid |
| "Rate limit exceeded" | Wait a minute, Groq has 30 req/min limit |

## Success Criteria ✅

You're ready when:
- [ ] Can start recording with mic button
- [ ] See your words appear in real-time
- [ ] Recording auto-stops after silence
- [ ] AI responds with relevant question
- [ ] Can continue conversation naturally
- [ ] No error messages appear

## Performance Indicators

**Good Performance:**
- Transcript appears within 1 second
- Auto-stop triggers in 2-3 seconds
- AI responds within 3-5 seconds
- Smooth conversation flow

**If Slower:**
- Check internet speed
- May be API rate limits
- Try different time of day

## Post-Setup

### Save Your Work
- [ ] API keys saved in password manager
- [ ] `.env` file backed up (keep private!)
- [ ] Test recording saved (optional)

### Next Steps
- [ ] Read `DEEPGRAM_INTEGRATION.md` for advanced features
- [ ] Customize interview questions
- [ ] Test with different scenarios
- [ ] Prepare for demo/production

## Quick Reference

**Start Server:**
```bash
npm run dev
```

**Check API Keys:**
```bash
# On Windows PowerShell
cat .env
```

**Common Commands:**
- Start: `npm run dev`
- Stop: `Ctrl+C`
- Install: `npm install`
- Build: `npm run build`

## Support Resources

- 📖 `SETUP_GUIDE.md` - Quick setup guide
- 📚 `DEEPGRAM_INTEGRATION.md` - Full documentation
- 📋 `IMPLEMENTATION_SUMMARY.md` - Feature overview
- 🔍 Browser Console (F12) - Error messages

## Final Checklist

Before marking as complete:
- [ ] All steps above completed
- [ ] API keys configured
- [ ] Server running successfully
- [ ] Can record and transcribe
- [ ] AI responds appropriately
- [ ] No errors in console
- [ ] Happy with the results! 🎉

---

## ⏱️ Time Estimate

- **Total Setup Time:** 15-20 minutes
- **API Key Setup:** 10 minutes
- **Configuration:** 2 minutes
- **Testing:** 5 minutes
- **Troubleshooting:** 0-10 minutes (if needed)

## 🎯 Status Tracking

Mark your progress:
- [ ] Not Started
- [ ] API Keys Obtained
- [ ] Environment Configured
- [ ] Server Started
- [ ] Initial Test Passed
- [ ] ✅ **FULLY WORKING!**

---

**Date Started:** _______________
**Date Completed:** _______________
**Notes:** _______________________________________________

Good luck! You've got this! 🚀
