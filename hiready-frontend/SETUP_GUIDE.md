# Quick Setup Guide - Voice Interview with Deepgram AI

## ⚡ Quick Start (5 minutes)

### Step 1: Add API Keys

Edit `.env` file in project root:

```env
VITE_DEEPGRAM_API_KEY=your_deepgram_api_key
VITE_GROQ_API_KEY=your_groq_api_key
```

### Step 2: Get Your API Keys

**Deepgram** (Free $200 credit):
1. Visit: https://console.deepgram.com/
2. Sign up → Create API Key → Copy

**Groq** (Free tier available):
1. Visit: https://console.groq.com/
2. Sign up → Create API Key → Copy

### Step 3: Restart Dev Server

```bash
npm run dev
```

### Step 4: Test It!

1. Open the app in browser
2. Navigate to Voice Interview page
3. Allow microphone access when prompted
4. Click the microphone button and speak
5. AI will respond with follow-up questions

## 🎯 What Was Integrated

### New Files Created:
- `src/lib/deepgram.ts` - Speech-to-text service
- `src/lib/llm.ts` - AI conversation service
- `.env` - Environment configuration
- `.env.example` - Example configuration

### Modified Files:
- `src/pages/VoiceInterview.tsx` - Complete AI integration

## ✨ Features Added

✅ Real-time speech-to-text with Deepgram  
✅ AI-powered interview questions with Llama 3.1 70B (via Groq)  
✅ Live transcript display  
✅ Text-to-speech for AI responses  
✅ Auto-stop after silence  
✅ Conversation history tracking  

## 🔧 How to Use

1. **Start Interview**: AI asks opening question
2. **Click Mic**: Start recording your response
3. **Speak**: Your words appear in real-time
4. **Auto-stop**: Recording stops after 2 seconds of silence
5. **AI Responds**: AI asks follow-up question
6. **Repeat**: Continue until interview ends

## 💡 Tips

- Speak clearly at moderate pace
- Reduce background noise
- Use Chrome/Edge for best compatibility
- Check microphone permissions if issues occur

## 📚 Full Documentation

See `DEEPGRAM_INTEGRATION.md` for:
- Detailed architecture
- Customization options
- Troubleshooting guide
- Production considerations
- API cost estimates

## 🚨 Important Notes

1. **API Keys Required**: App won't work without valid API keys
2. **HTTPS/Localhost**: Microphone access requires secure context
3. **Browser Permissions**: Must allow microphone access
4. **Cost**: ~$0.40 per 30-minute interview (90% cheaper with Groq!)

## 🐛 Troubleshooting

**Microphone not working?**
- Check browser permissions (click lock icon in address bar)
- Reload page after granting permissions

**API errors?**
- Verify API keys in `.env`
- Restart dev server after changing `.env`
- Check API key validity on provider websites

**No transcription?**
- Speak louder
- Check system microphone settings
- Try different browser

## 🎉 That's It!

You now have a fully functional AI-powered voice interview system with:
- Real-time speech recognition (Deepgram)
- Intelligent responses (Llama 3.1 70B via Groq - Lightning fast!)
- Professional interview experience

Enjoy your AI interviewer! 🚀
