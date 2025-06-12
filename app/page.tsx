"use client"

import { useState, useEffect, useRef } from "react"
import { Mic, MicOff, Settings, Check, Plus } from "lucide-react"
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd"

interface Task {
  id: string
  description: string
  dueDate: string
  completed: boolean
  createdAt: Date
  completedAt?: Date
}

interface RecordingState {
  isRecording: boolean
  duration: number
  transcript: string
}

export default function SpeechToTasks() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [recording, setRecording] = useState<RecordingState>({
    isRecording: false,
    duration: 0,
    transcript: "",
  })
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

  // Load tasks from localStorage on mount
  useEffect(() => {
    const savedTasks = localStorage.getItem("speech-tasks")
    if (savedTasks) {
      setTasks(JSON.parse(savedTasks))
    }
  }, [])

  // Save tasks to localStorage whenever tasks change
  useEffect(() => {
    localStorage.setItem("speech-tasks", JSON.stringify(tasks))
  }, [tasks])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === "r" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        toggleRecording()
      }
      if (e.key === "Enter" && selectedTaskId) {
        e.preventDefault()
        toggleTaskCompletion(selectedTaskId)
      }
    }

    window.addEventListener("keydown", handleKeyPress)
    return () => window.removeEventListener("keydown", handleKeyPress)
  }, [recording.isRecording, selectedTaskId])

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)

      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data)
      }

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/wav" })
        await processAudio(audioBlob)
        stream.getTracks().forEach((track) => track.stop())
      }

      mediaRecorder.start()
      setRecording((prev) => ({ ...prev, isRecording: true, duration: 0 }))

      // Start duration timer
      intervalRef.current = setInterval(() => {
        setRecording((prev) => ({ ...prev, duration: prev.duration + 1 }))
      }, 1000)
    } catch (error) {
      console.error("Error starting recording:", error)
      alert("Could not access microphone. Please check permissions.")
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording.isRecording) {
      mediaRecorderRef.current.stop()
      setRecording((prev) => ({ ...prev, isRecording: false }))

      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }

  const toggleRecording = () => {
    if (recording.isRecording) {
      stopRecording()
    } else {
      startRecording()
    }
  }

  const transcribeAudio = async (audioBlob: Blob): Promise<string> => {
    try {
      const response = await fetch('https://api.deepgram.com/v1/listen', {
        method: 'POST',
        headers: {
          'Authorization': `Token ${process.env.NEXT_PUBLIC_DEEPGRAM_API_KEY}`,
          'Content-Type': 'audio/wav'
        },
        body: audioBlob
      });

      if (!response.ok) {
        throw new Error(`Deepgram API error: ${response.status}`);
      }

      const result = await response.json();
      return result.results.channels[0].alternatives[0].transcript || '';
    } catch (error) {
      console.error('Error transcribing audio:', error);
      throw new Error('Failed to transcribe audio. Please try again.');
    }
  }

  const parseTasksFromTranscript = async (
    transcript: string,
  ): Promise<Omit<Task, "id" | "completed" | "createdAt">[]> => {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'openai/gpt-3.5-turbo',
          messages: [
            {
              role: 'system',
              content: `You are a task parser. Extract individual tasks from the user's speech and return them as a JSON array. Each task should have:
- description: A clear, actionable task description
- dueDate: ISO date string (YYYY-MM-DD format)

For relative dates, use these rules:
- "today" = today's date
- "tomorrow" = tomorrow's date  
- "next week" = 7 days from today
- "Friday", "Monday", etc. = next occurrence of that day
- If no date mentioned, default to 7 days from today

Return ONLY a valid JSON array, no other text.

Example input: "Buy groceries tomorrow and call dentist next week"
Example output: [{"description": "Buy groceries", "dueDate": "2024-01-15"}, {"description": "Call dentist", "dueDate": "2024-01-21"}]`
            },
            {
              role: 'user',
              content: transcript
            }
          ],
          temperature: 0.1,
          max_tokens: 500
        })
      });

      if (!response.ok) {
        throw new Error(`OpenRouter API error: ${response.status}`);
      }

      const result = await response.json();
      const content = result.choices[0].message.content;
      
      const tasks = JSON.parse(content);
      
      if (!Array.isArray(tasks)) {
        throw new Error('Invalid response format from LLM');
      }

      return tasks.map(task => ({
        description: task.description || 'Untitled task',
        dueDate: task.dueDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
      }));
    } catch (error) {
      console.error('Error parsing tasks:', error);
      throw new Error('Failed to parse tasks from speech. Please try again.');
    }
  }

  const processAudio = async (audioBlob: Blob) => {
    try {
      setRecording((prev) => ({ ...prev, transcript: "Transcribing..." }))

      // Step 1: Transcribe audio
      const transcript = await transcribeAudio(audioBlob)
      setRecording((prev) => ({ ...prev, transcript }))

      // Step 2: Parse tasks from transcript
      const parsedTasks = await parseTasksFromTranscript(transcript)

      // Step 3: Add tasks to the list
      const newTasks = parsedTasks.map((task) => ({
        ...task,
        id: crypto.randomUUID(),
        completed: false,
        createdAt: new Date(),
      }))

      setTasks((prev) => [...prev, ...newTasks])

      // Clear transcript after processing
      setTimeout(() => {
        setRecording((prev) => ({ ...prev, transcript: "", duration: 0 }))
      }, 2000)
    } catch (error) {
      console.error("Error processing audio:", error)
      setRecording((prev) => ({ ...prev, transcript: "Error processing audio" }))
    }
  }

  const toggleTaskCompletion = (taskId: string) => {
    setTasks((prev) =>
      prev.map((task) =>
        task.id === taskId
          ? {
              ...task,
              completed: !task.completed,
              completedAt: !task.completed ? new Date() : undefined,
            }
          : task,
      ),
    )
  }

  const handleDragEnd = (result: any) => {
    if (!result.destination) return

    const { source, destination } = result

    if (source.droppableId === destination.droppableId) {
      // Reordering within the same column
      const todoTasks = tasks.filter((task) => !task.completed)
      const reorderedTasks = Array.from(todoTasks)
      const [removed] = reorderedTasks.splice(source.index, 1)
      reorderedTasks.splice(destination.index, 0, removed)

      const completedTasks = tasks.filter((task) => task.completed)
      setTasks([...reorderedTasks, ...completedTasks])
    }
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  const formatDueDate = (dateString: string) => {
    const date = new Date(dateString)
    const today = new Date()
    const diffTime = date.getTime() - today.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return "Today"
    if (diffDays === 1) return "Tomorrow"
    if (diffDays === -1) return "Yesterday"
    if (diffDays > 1) return `In ${diffDays} days`
    if (diffDays < -1) return `${Math.abs(diffDays)} days ago`

    return date.toLocaleDateString()
  }

  const todoTasks = tasks.filter((task) => !task.completed)
  const completedTasks = tasks.filter((task) => task.completed)

  return (
    <div className="app">
      {/* Top Bar */}
      <header className="top-bar">
        <h1 className="app-title">TaskSpeak</h1>
        <div className="top-bar-controls">
          <div className="mic-status">
            {recording.isRecording && (
              <span className="recording-indicator">
                <div className="pulse-dot" />
                Recording
              </span>
            )}
          </div>
          <button className="icon-button" aria-label="Settings">
            <Settings size={20} />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="main-content">
        {/* Record Panel */}
        <section className="record-panel">
          <button
            className={`record-button ${recording.isRecording ? "recording" : ""}`}
            onClick={toggleRecording}
            aria-label={recording.isRecording ? "Stop recording" : "Start recording"}
          >
            {recording.isRecording ? <MicOff size={32} /> : <Mic size={32} />}
          </button>

          {recording.isRecording && (
            <div className="recording-info">
              <span className="duration">{formatDuration(recording.duration)}</span>
            </div>
          )}

          {recording.transcript && (
            <div className="transcript">
              <p>{recording.transcript}</p>
            </div>
          )}

          <p className="record-hint">
            Press <kbd>R</kbd> to record, or click the microphone
          </p>
        </section>

        {/* Task Board */}
        <section className="task-board">
          <DragDropContext onDragEnd={handleDragEnd}>
            {/* To Do Column */}
            <div className="task-column">
              <div className="column-header">
                <h2>To Do</h2>
                <span className="task-count">{todoTasks.length}</span>
              </div>

              <Droppable droppableId="todo">
                {(provided) => (
                  <div className="task-list" {...provided.droppableProps} ref={provided.innerRef}>
                    {todoTasks.map((task, index) => (
                      <Draggable key={task.id} draggableId={task.id} index={index}>
                        {(provided, snapshot) => (
                          <div
                            className={`task-card ${selectedTaskId === task.id ? "selected" : ""} ${snapshot.isDragging ? "dragging" : ""}`}
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            onClick={() => setSelectedTaskId(task.id)}
                            tabIndex={0}
                            role="button"
                            aria-label={`Task: ${task.description}`}
                          >
                            <div className="task-content">
                              <p className="task-description">{task.description}</p>
                              <span className="due-date-badge">{formatDueDate(task.dueDate)}</span>
                            </div>
                            <button
                              className="task-action"
                              onClick={(e) => {
                                e.stopPropagation()
                                toggleTaskCompletion(task.id)
                              }}
                              aria-label="Mark as complete"
                            >
                              <Check size={16} />
                            </button>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}

                    {todoTasks.length === 0 && (
                      <div className="empty-state">
                        <Plus size={24} />
                        <p>No tasks yet. Record your voice to add tasks!</p>
                      </div>
                    )}
                  </div>
                )}
              </Droppable>
            </div>

            {/* Done Column */}
            <div className="task-column">
              <div className="column-header">
                <h2>Done</h2>
                <span className="task-count">{completedTasks.length}</span>
              </div>

              <div className="task-list">
                {completedTasks.map((task) => (
                  <div key={task.id} className="task-card completed">
                    <div className="task-content">
                      <p className="task-description">{task.description}</p>
                      <span className="due-date-badge completed">
                        Completed {task.completedAt ? new Date(task.completedAt).toLocaleDateString() : ""}
                      </span>
                    </div>
                    <button
                      className="task-action completed"
                      onClick={() => toggleTaskCompletion(task.id)}
                      aria-label="Mark as incomplete"
                    >
                      <Check size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </DragDropContext>
        </section>
      </main>
    </div>
  )
}
