# TaskSpeak - Speech-to-Task Web App

A minimalist web application that converts spoken input into structured tasks with due dates, inspired by Notion's clean design.

## Features

- 🎤 **Speech Recording**: Click-to-record with visual feedback
- 📝 **Task Parsing**: Converts speech to structured tasks with due dates
- 📋 **Task Management**: Drag-and-drop task organization
- ✅ **Task Completion**: Mark tasks as done with visual feedback
- ⌨️ **Keyboard Shortcuts**: `R` to record, `Enter` to complete selected task
- 📱 **Responsive Design**: Mobile-friendly layout
- ♿ **Accessible**: WCAG AA compliant with proper ARIA labels

## Setup Instructions

### Prerequisites
- Node.js 18+ 
- npm or yarn package manager

### Installation

1. Clone or download the project files
2. Install dependencies:
   \`\`\`bash
   npm install
   # or
   yarn install
   \`\`\`

3. Start the development server:
   \`\`\`bash
   npm run dev
   # or
   yarn dev
   \`\`\`

4. Open [http://localhost:3000](http://localhost:3000) in your browser

## Usage

1. **Recording**: Click the microphone button or press `R` to start/stop recording
2. **Task Creation**: Speak your tasks naturally (e.g., "Buy groceries tomorrow, finish report by Friday")
3. **Task Management**: 
   - Drag tasks to reorder within the "To Do" column
   - Click the checkmark to complete tasks
   - Use `Enter` key to complete the selected task
4. **Persistence**: Tasks are automatically saved to localStorage

## TODOs - Backend Integration

### 1. DeepGram API Integration
Replace the `transcribeAudio` function in `app/page.tsx`:

\`\`\`typescript
const transcribeAudio = async (audioBlob: Blob): Promise<string> => {
  const formData = new FormData();
  formData.append('audio', audioBlob);
  
  const response = await fetch('https://api.deepgram.com/v1/listen', {
    method: 'POST',
    headers: {
      'Authorization': `Token ${process.env.NEXT_PUBLIC_DEEPGRAM_API_KEY}`,
      'Content-Type': 'audio/wav'
    },
    body: audioBlob
  });
  
  const result = await response.json();
  return result.results.channels[0].alternatives[0].transcript;
};
\`\`\`

### 2. OpenRouter LLM Integration
Replace the `parseTasksFromTranscript` function:

\`\`\`typescript
const parseTasksFromTranscript = async (transcript: string) => {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.NEXT_PUBLIC_OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'openrouter/mistral-7b-instruct',
      messages: [
        {
          role: 'system',
          content: 'Split the text into atomic tasks. Each task must include a due-date or default to today+7 days. Return JSON array with {description, dueDate} format.'
        },
        {
          role: 'user',
          content: transcript
        }
      ]
    })
  });
  
  const result = await response.json();
  return JSON.parse(result.choices[0].message.content);
};
\`\`\`

### 3. Environment Variables
Create a `.env.local` file:

\`\`\`env
NEXT_PUBLIC_DEEPGRAM_API_KEY=your_deepgram_api_key
NEXT_PUBLIC_OPENROUTER_API_KEY=your_openrouter_api_key
\`\`\`

### 4. Database Integration (Optional)
For persistent storage beyond localStorage:

- Add Supabase, Firebase, or your preferred database
- Replace localStorage calls with API endpoints
- Implement user authentication if needed

## Design System

The app uses Notion-inspired design tokens:

\`\`\`css
--n-bg: #FFFFFF;        /* Main canvas */
--n-sidebar: #F7F6F3;   /* Sidebar background */
--n-text: #37352F;      /* Default text */
--n-grey: #F1F1EF;      /* Subtle surfaces */
--n-blue: #337EA9;      /* Primary accent */
--n-green: #448361;     /* Success states */
--n-red: #D44C47;       /* Error/recording */
\`\`\`

## Browser Compatibility

- Chrome 60+
- Firefox 55+
- Safari 11+
- Edge 79+

Requires microphone permissions for speech recording functionality.

## License

MIT License - feel free to modify and use as needed.
