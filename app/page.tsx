'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { callAIAgent } from '@/lib/aiAgent'
import { listSchedules, getScheduleLogs, pauseSchedule, resumeSchedule, cronToHuman, triggerScheduleNow } from '@/lib/scheduler'
import type { Schedule, ExecutionLog } from '@/lib/scheduler'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import {
  FiHome, FiBarChart2, FiSettings, FiPlus, FiSearch, FiBell,
  FiMessageSquare, FiSend, FiClock, FiChevronDown,
  FiChevronUp, FiCheckCircle, FiAlertCircle, FiAlertTriangle,
  FiX, FiMenu, FiPlay, FiRefreshCw, FiTrash2,
  FiCalendar, FiZap, FiTrendingUp, FiList,
  FiCircle, FiLoader, FiChevronLeft, FiActivity
} from 'react-icons/fi'

// ============================================================================
// CONSTANTS
// ============================================================================

const TASK_AGENT_ID = '69a0921c849533a5e9977933'
const REMINDER_AGENT_ID = '69a0921d5fbdce87bf6e73e9'
const SCHEDULE_ID_INITIAL = '69a0922625d4d77f732e739a'

const THEME_VARS: React.CSSProperties & Record<string, string> = {
  '--background': '120 15% 98%',
  '--foreground': '150 30% 10%',
  '--card': '120 15% 96%',
  '--card-foreground': '150 30% 10%',
  '--popover': '120 15% 94%',
  '--popover-foreground': '150 30% 10%',
  '--primary': '142 76% 26%',
  '--primary-foreground': '120 15% 98%',
  '--secondary': '120 15% 92%',
  '--secondary-foreground': '150 30% 15%',
  '--accent': '160 60% 30%',
  '--accent-foreground': '120 15% 98%',
  '--destructive': '0 84% 60%',
  '--muted': '120 12% 90%',
  '--muted-foreground': '150 20% 45%',
  '--border': '120 15% 88%',
  '--input': '120 12% 80%',
  '--ring': '142 76% 26%',
  '--radius': '0.875rem',
} as React.CSSProperties & Record<string, string>

// ============================================================================
// TYPES
// ============================================================================

interface SubTask {
  id: string
  title: string
  completed: boolean
}

interface Task {
  id: string
  title: string
  description: string
  deadline: string
  priority: 'urgent' | 'high' | 'medium' | 'low'
  status: 'today' | 'upcoming' | 'completed'
  estimatedTime: string
  subtasks: SubTask[]
  tags: string[]
  createdAt: string
  completedAt: string | null
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  data?: Record<string, unknown>
}

interface Notification {
  id: string
  message: string
  taskName: string
  priority: string
  timestamp: string
  read: boolean
  suggestedAction?: string
}

interface TaskAgentResponse {
  analysis_type?: string
  message?: string
  tasks?: Array<{
    task_name?: string
    priority?: string
    estimated_time?: string
    subtasks?: string[]
    notes?: string
  }>
  productivity_tips?: string[]
  workload_summary?: {
    total_tasks?: number
    urgent_count?: number
    high_count?: number
    medium_count?: number
    low_count?: number
    estimated_total_time?: string
    balance_status?: string
  }
}

interface ReminderAgentResponse {
  reminders?: Array<{
    task_name?: string
    priority?: string
    deadline?: string
    reminder_message?: string
    urgency_reason?: string
    suggested_action?: string
  }>
  summary?: string
  next_check_recommendation?: string
}

// ============================================================================
// ERROR BOUNDARY
// ============================================================================

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: '' }
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
          <div className="text-center p-8 max-w-md">
            <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
            <p className="text-muted-foreground mb-4 text-sm">{this.state.error}</p>
            <button onClick={() => this.setState({ hasError: false, error: '' })} className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm">
              Try again
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function genId(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
}

function priorityColor(priority: string): string {
  switch (priority?.toLowerCase()) {
    case 'urgent': return 'hsl(0 84% 60%)'
    case 'high': return 'hsl(25 95% 53%)'
    case 'medium': return 'hsl(48 96% 53%)'
    case 'low': return 'hsl(142 76% 36%)'
    default: return 'hsl(150 20% 45%)'
  }
}

function priorityBadgeClass(priority: string): string {
  switch (priority?.toLowerCase()) {
    case 'urgent': return 'bg-red-100 text-red-700 border-red-200'
    case 'high': return 'bg-orange-100 text-orange-700 border-orange-200'
    case 'medium': return 'bg-yellow-100 text-yellow-700 border-yellow-200'
    case 'low': return 'bg-green-100 text-green-700 border-green-200'
    default: return 'bg-gray-100 text-gray-700 border-gray-200'
  }
}

function renderMarkdown(text: string) {
  if (!text) return null
  return (
    <div className="space-y-2">
      {text.split('\n').map((line, i) => {
        if (line.startsWith('### ')) return <h4 key={i} className="font-semibold text-sm mt-3 mb-1">{line.slice(4)}</h4>
        if (line.startsWith('## ')) return <h3 key={i} className="font-semibold text-base mt-3 mb-1">{line.slice(3)}</h3>
        if (line.startsWith('# ')) return <h2 key={i} className="font-bold text-lg mt-4 mb-2">{line.slice(2)}</h2>
        if (line.startsWith('- ') || line.startsWith('* ')) return <li key={i} className="ml-4 list-disc text-sm">{formatInline(line.slice(2))}</li>
        if (/^\d+\.\s/.test(line)) return <li key={i} className="ml-4 list-decimal text-sm">{formatInline(line.replace(/^\d+\.\s/, ''))}</li>
        if (!line.trim()) return <div key={i} className="h-1" />
        return <p key={i} className="text-sm">{formatInline(line)}</p>
      })}
    </div>
  )
}

function formatInline(text: string) {
  const parts = text.split(/\*\*(.*?)\*\*/g)
  if (parts.length === 1) return text
  return parts.map((part, i) => i % 2 === 1 ? <strong key={i} className="font-semibold">{part}</strong> : part)
}

// ============================================================================
// SAMPLE DATA
// ============================================================================

function getSampleTasks(): Task[] {
  return [
    {
      id: genId(), title: 'Finalize quarterly report', description: 'Complete and submit Q4 financial summary to management',
      deadline: '2026-02-27', priority: 'urgent', status: 'today', estimatedTime: '3 hours',
      subtasks: [
        { id: genId(), title: 'Gather financial data', completed: true },
        { id: genId(), title: 'Create charts and graphs', completed: false },
        { id: genId(), title: 'Write executive summary', completed: false },
      ],
      tags: ['finance', 'report'], createdAt: '2026-02-24T09:00:00Z', completedAt: null
    },
    {
      id: genId(), title: 'Review pull requests', description: 'Review and merge pending PRs for the sprint',
      deadline: '2026-02-26', priority: 'high', status: 'today', estimatedTime: '1.5 hours',
      subtasks: [
        { id: genId(), title: 'PR #142 - Auth module', completed: false },
        { id: genId(), title: 'PR #145 - Dashboard UI', completed: false },
      ],
      tags: ['development'], createdAt: '2026-02-25T10:00:00Z', completedAt: null
    },
    {
      id: genId(), title: 'Prepare presentation slides', description: 'Create slides for Friday team meeting on project roadmap',
      deadline: '2026-02-28', priority: 'medium', status: 'upcoming', estimatedTime: '2 hours',
      subtasks: [], tags: ['meeting', 'planning'], createdAt: '2026-02-25T14:00:00Z', completedAt: null
    },
    {
      id: genId(), title: 'Update documentation', description: 'Update API docs with new endpoints from v2.1 release',
      deadline: '2026-03-01', priority: 'low', status: 'upcoming', estimatedTime: '1 hour',
      subtasks: [], tags: ['docs'], createdAt: '2026-02-26T08:00:00Z', completedAt: null
    },
    {
      id: genId(), title: 'Fix login page bug', description: 'Resolve the redirect issue on login timeout',
      deadline: '2026-02-25', priority: 'high', status: 'completed', estimatedTime: '45 min',
      subtasks: [
        { id: genId(), title: 'Reproduce the issue', completed: true },
        { id: genId(), title: 'Fix redirect logic', completed: true },
        { id: genId(), title: 'Add unit tests', completed: true },
      ],
      tags: ['bugfix'], createdAt: '2026-02-23T11:00:00Z', completedAt: '2026-02-25T16:00:00Z'
    },
  ]
}

function getSampleNotifications(): Notification[] {
  return [
    {
      id: genId(), message: 'Quarterly report deadline is tomorrow. Start now to avoid rushing.',
      taskName: 'Finalize quarterly report', priority: 'urgent',
      timestamp: '2026-02-26T10:00:00Z', read: false,
      suggestedAction: 'Begin gathering financial data immediately'
    },
    {
      id: genId(), message: 'You have 2 pending pull requests that need attention.',
      taskName: 'Review pull requests', priority: 'high',
      timestamp: '2026-02-26T08:30:00Z', read: false,
      suggestedAction: 'Allocate 90 minutes for thorough code review'
    },
  ]
}

function getSampleChatMessages(): ChatMessage[] {
  return [
    {
      id: genId(), role: 'user', content: 'What tasks should I focus on today?',
      timestamp: '2026-02-26T09:00:00Z'
    },
    {
      id: genId(), role: 'assistant',
      content: 'Based on your current workload, I recommend prioritizing:\n\n1. **Finalize quarterly report** - This is urgent with a deadline tomorrow. Start with gathering the financial data.\n2. **Review pull requests** - These are blocking other team members.\n\nYour workload is slightly heavy today with approximately 4.5 hours of focused work needed.',
      timestamp: '2026-02-26T09:01:00Z'
    },
  ]
}

// ============================================================================
// TASK CARD COMPONENT
// ============================================================================

function TaskCard({
  task,
  onComplete,
  onToggleSubtask,
  onDelete,
}: {
  task: Task
  onComplete: (id: string) => void
  onToggleSubtask: (taskId: string, subtaskId: string) => void
  onDelete: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const completedSubs = Array.isArray(task.subtasks) ? task.subtasks.filter(s => s.completed).length : 0
  const totalSubs = Array.isArray(task.subtasks) ? task.subtasks.length : 0
  const progress = totalSubs > 0 ? Math.round((completedSubs / totalSubs) * 100) : 0

  return (
    <Card className="mb-3 border transition-all duration-200 hover:shadow-md" style={{ borderRadius: '14px' }}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <button onClick={() => task.status !== 'completed' ? onComplete(task.id) : undefined} className="flex-shrink-0 mt-0.5">
                {task.status === 'completed' ? (
                  <FiCheckCircle className="w-5 h-5" style={{ color: 'hsl(142 76% 26%)' }} />
                ) : (
                  <FiCircle className="w-5 h-5 text-muted-foreground hover:text-foreground transition-colors" />
                )}
              </button>
              <h4 className={`font-medium text-sm truncate ${task.status === 'completed' ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                {task.title}
              </h4>
            </div>
            <div className="flex items-center gap-2 ml-7 flex-wrap">
              <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${priorityBadgeClass(task.priority)}`}>
                {task.priority}
              </span>
              {task.estimatedTime && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <FiClock className="w-3 h-3" /> {task.estimatedTime}
                </span>
              )}
              {task.deadline && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <FiCalendar className="w-3 h-3" /> {task.deadline}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {totalSubs > 0 && (
              <button onClick={() => setExpanded(!expanded)} className="p-1 rounded hover:bg-secondary transition-colors">
                {expanded ? <FiChevronUp className="w-4 h-4 text-muted-foreground" /> : <FiChevronDown className="w-4 h-4 text-muted-foreground" />}
              </button>
            )}
            <button onClick={() => onDelete(task.id)} className="p-1 rounded hover:bg-red-50 transition-colors">
              <FiTrash2 className="w-4 h-4 text-muted-foreground hover:text-red-500" />
            </button>
          </div>
        </div>
        {totalSubs > 0 && (
          <div className="mt-2 ml-7">
            <div className="flex items-center gap-2 mb-1">
              <Progress value={progress} className="h-1.5 flex-1" />
              <span className="text-xs text-muted-foreground">{completedSubs}/{totalSubs}</span>
            </div>
          </div>
        )}
        {expanded && totalSubs > 0 && (
          <div className="mt-2 ml-7 space-y-1">
            {task.subtasks.map(sub => (
              <div key={sub.id} className="flex items-center gap-2">
                <button onClick={() => onToggleSubtask(task.id, sub.id)} className="flex-shrink-0">
                  {sub.completed ? (
                    <FiCheckCircle className="w-4 h-4" style={{ color: 'hsl(142 76% 26%)' }} />
                  ) : (
                    <FiCircle className="w-4 h-4 text-muted-foreground" />
                  )}
                </button>
                <span className={`text-xs ${sub.completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                  {sub.title}
                </span>
              </div>
            ))}
          </div>
        )}
        {Array.isArray(task.tags) && task.tags.length > 0 && (
          <div className="mt-2 ml-7 flex gap-1 flex-wrap">
            {task.tags.map(tag => (
              <span key={tag} className="text-xs px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground">{tag}</span>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function Page() {
  // Navigation
  const [activeNav, setActiveNav] = useState<'dashboard' | 'insights' | 'settings'>('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(true)

  // Tasks
  const [tasks, setTasks] = useState<Task[]>([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [newTask, setNewTask] = useState({ title: '', description: '', deadline: '', priority: 'medium' as Task['priority'], tags: '' })
  const [filterPriority, setFilterPriority] = useState<string>('all')

  // Chat
  const [chatOpen, setChatOpen] = useState(false)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Notifications
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [showNotifications, setShowNotifications] = useState(false)

  // Active agent
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null)

  // Scheduler
  const [scheduleId, setScheduleId] = useState(SCHEDULE_ID_INITIAL)
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [scheduleLogs, setScheduleLogs] = useState<ExecutionLog[]>([])
  const [scheduleLoading, setScheduleLoading] = useState(false)
  const [scheduleError, setScheduleError] = useState<string | null>(null)

  // Sample data toggle
  const [sampleDataOn, setSampleDataOn] = useState(false)

  // Status messages
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)

  // Settings
  const [quietHours, setQuietHours] = useState(false)
  const [soundAlerts, setSoundAlerts] = useState(true)
  const [autoPriority, setAutoPriority] = useState(true)
  const [inAppNotifs, setInAppNotifs] = useState(true)

  // ---- Sample data toggle logic ----
  useEffect(() => {
    if (sampleDataOn) {
      setTasks(getSampleTasks())
      setNotifications(getSampleNotifications())
      setChatMessages(getSampleChatMessages())
    } else {
      setTasks([])
      setNotifications([])
      setChatMessages([])
    }
  }, [sampleDataOn])

  // ---- Load schedules on mount ----
  const loadSchedules = useCallback(async () => {
    setScheduleLoading(true)
    setScheduleError(null)
    try {
      const result = await listSchedules()
      if (result.success) {
        setSchedules(Array.isArray(result.schedules) ? result.schedules : [])
        const found = result.schedules.find(s => s.id === scheduleId)
        if (found) {
          setScheduleId(found.id)
        }
      } else {
        setScheduleError(result.error ?? 'Failed to load schedules')
      }
    } catch {
      setScheduleError('Failed to load schedules')
    }
    setScheduleLoading(false)
  }, [scheduleId])

  const loadScheduleLogs = useCallback(async () => {
    if (!scheduleId) return
    try {
      const result = await getScheduleLogs(scheduleId, { limit: 10 })
      if (result.success) {
        setScheduleLogs(Array.isArray(result.executions) ? result.executions : [])
      }
    } catch {
      // silently fail
    }
  }, [scheduleId])

  useEffect(() => {
    loadSchedules()
    loadScheduleLogs()
  }, [loadSchedules, loadScheduleLogs])

  // scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  // ---- Clear status messages ----
  useEffect(() => {
    if (statusMessage) {
      const t = setTimeout(() => setStatusMessage(null), 4000)
      return () => clearTimeout(t)
    }
  }, [statusMessage])

  // ---- TASK MANAGEMENT ----
  const addTask = () => {
    if (!newTask.title.trim()) return
    const today = new Date().toISOString().split('T')[0]
    const isToday = !newTask.deadline || newTask.deadline <= today
    const task: Task = {
      id: genId(),
      title: newTask.title.trim(),
      description: newTask.description.trim(),
      deadline: newTask.deadline,
      priority: newTask.priority,
      status: isToday ? 'today' : 'upcoming',
      estimatedTime: '',
      subtasks: [],
      tags: newTask.tags ? newTask.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
      createdAt: new Date().toISOString(),
      completedAt: null,
    }
    setTasks(prev => [...prev, task])
    setNewTask({ title: '', description: '', deadline: '', priority: 'medium', tags: '' })
    setShowAddModal(false)
    setStatusMessage({ type: 'success', text: 'Task added successfully' })
  }

  const completeTask = (id: string) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status: 'completed' as const, completedAt: new Date().toISOString() } : t))
  }

  const deleteTask = (id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id))
  }

  const toggleSubtask = (taskId: string, subtaskId: string) => {
    setTasks(prev => prev.map(t => {
      if (t.id !== taskId) return t
      return {
        ...t,
        subtasks: Array.isArray(t.subtasks) ? t.subtasks.map(s => s.id === subtaskId ? { ...s, completed: !s.completed } : s) : []
      }
    }))
  }

  // ---- CHAT & AI AGENT ----
  const sendChatMessage = async (message?: string) => {
    const text = message ?? chatInput.trim()
    if (!text) return
    setChatInput('')
    const userMsg: ChatMessage = { id: genId(), role: 'user', content: text, timestamp: new Date().toISOString() }
    setChatMessages(prev => [...prev, userMsg])
    setChatLoading(true)
    setActiveAgentId(TASK_AGENT_ID)

    try {
      const result = await callAIAgent(text, TASK_AGENT_ID)
      if (result.success) {
        const data = result?.response?.result as TaskAgentResponse | undefined
        const responseText = data?.message ?? 'Analysis complete.'
        const responseTasks = Array.isArray(data?.tasks) ? data.tasks : []
        const tips = Array.isArray(data?.productivity_tips) ? data.productivity_tips : []
        const workload = data?.workload_summary

        let fullResponse = responseText
        if (responseTasks.length > 0) {
          fullResponse += '\n\n### Task Suggestions\n'
          responseTasks.forEach(t => {
            fullResponse += `\n- **${t?.task_name ?? 'Task'}** - Priority: ${t?.priority ?? 'N/A'}, Est: ${t?.estimated_time ?? 'N/A'}`
            if (t?.notes) fullResponse += ` -- ${t.notes}`
            const subs = Array.isArray(t?.subtasks) ? t.subtasks : []
            if (subs.length > 0) {
              subs.forEach(s => { fullResponse += `\n  - ${s}` })
            }
          })
        }
        if (tips.length > 0) {
          fullResponse += '\n\n### Productivity Tips\n'
          tips.forEach(tip => { fullResponse += `\n- ${tip}` })
        }
        if (workload) {
          fullResponse += `\n\n### Workload Summary\nTotal: ${workload?.total_tasks ?? 0} tasks | Urgent: ${workload?.urgent_count ?? 0} | High: ${workload?.high_count ?? 0} | Medium: ${workload?.medium_count ?? 0} | Low: ${workload?.low_count ?? 0}\nEstimated time: ${workload?.estimated_total_time ?? 'N/A'} | Balance: ${workload?.balance_status ?? 'N/A'}`
        }

        const assistantMsg: ChatMessage = {
          id: genId(), role: 'assistant', content: fullResponse,
          timestamp: new Date().toISOString(),
          data: data as Record<string, unknown> | undefined,
        }
        setChatMessages(prev => [...prev, assistantMsg])

        // Apply suggestions to matching tasks
        if (responseTasks.length > 0) {
          setTasks(prev => {
            const updated = [...prev]
            responseTasks.forEach(rt => {
              const match = updated.find(t => t.title.toLowerCase().includes((rt?.task_name ?? '').toLowerCase()) || (rt?.task_name ?? '').toLowerCase().includes(t.title.toLowerCase()))
              if (match) {
                if (rt?.priority) {
                  const p = rt.priority.toLowerCase()
                  if (['urgent', 'high', 'medium', 'low'].includes(p)) {
                    match.priority = p as Task['priority']
                  }
                }
                if (rt?.estimated_time) match.estimatedTime = rt.estimated_time
                const newSubs = Array.isArray(rt?.subtasks) ? rt.subtasks : []
                if (newSubs.length > 0 && match.subtasks.length === 0) {
                  match.subtasks = newSubs.map(s => ({ id: genId(), title: s, completed: false }))
                }
              }
            })
            return updated
          })
        }
      } else {
        const errMsg: ChatMessage = {
          id: genId(), role: 'assistant',
          content: 'I encountered an error processing your request. Please try again.',
          timestamp: new Date().toISOString(),
        }
        setChatMessages(prev => [...prev, errMsg])
      }
    } catch {
      const errMsg: ChatMessage = {
        id: genId(), role: 'assistant',
        content: 'Network error. Please check your connection and try again.',
        timestamp: new Date().toISOString(),
      }
      setChatMessages(prev => [...prev, errMsg])
    }
    setChatLoading(false)
    setActiveAgentId(null)
  }

  const analyzeTasks = async () => {
    const activeTasks = tasks.filter(t => t.status !== 'completed')
    if (activeTasks.length === 0) {
      setStatusMessage({ type: 'info', text: 'No active tasks to analyze. Add some tasks first.' })
      return
    }
    const taskList = activeTasks.map(t => `- ${t.title}: ${t.description || 'No description'} (deadline: ${t.deadline || 'none'})`).join('\n')
    const message = `Analyze these tasks and suggest priorities, time estimates, and subtask breakdowns:\n${taskList}`
    if (!chatOpen) setChatOpen(true)
    await sendChatMessage(message)
  }

  // ---- REMINDERS ----
  const triggerReminders = async () => {
    const activeTasks = tasks.filter(t => t.status !== 'completed')
    if (activeTasks.length === 0) {
      setStatusMessage({ type: 'info', text: 'No active tasks for reminders.' })
      return
    }
    setChatLoading(true)
    setActiveAgentId(REMINDER_AGENT_ID)
    const taskSummary = activeTasks.map(t => `${t.title} (priority: ${t.priority}, deadline: ${t.deadline || 'none'})`).join('; ')

    try {
      const result = await callAIAgent(`Check these tasks and generate reminders: ${taskSummary}`, REMINDER_AGENT_ID)
      if (result.success) {
        const data = result?.response?.result as ReminderAgentResponse | undefined
        const reminders = Array.isArray(data?.reminders) ? data.reminders : []

        reminders.forEach(r => {
          const notif: Notification = {
            id: genId(),
            message: r?.reminder_message ?? 'You have a task that needs attention.',
            taskName: r?.task_name ?? 'Unknown Task',
            priority: r?.priority ?? 'medium',
            timestamp: new Date().toISOString(),
            read: false,
            suggestedAction: r?.suggested_action,
          }
          setNotifications(prev => [notif, ...prev])
        })

        if (data?.summary) {
          const botMsg: ChatMessage = {
            id: genId(), role: 'assistant',
            content: `### Reminder Check\n\n${data.summary}\n\n${data?.next_check_recommendation ? `**Next check:** ${data.next_check_recommendation}` : ''}`,
            timestamp: new Date().toISOString(),
          }
          setChatMessages(prev => [...prev, botMsg])
        }
        setStatusMessage({ type: 'success', text: `${reminders.length} reminder(s) generated` })
      } else {
        setStatusMessage({ type: 'error', text: 'Failed to generate reminders' })
      }
    } catch {
      setStatusMessage({ type: 'error', text: 'Error contacting reminder agent' })
    }
    setChatLoading(false)
    setActiveAgentId(null)
  }

  // ---- SCHEDULE MANAGEMENT ----
  const handleToggleSchedule = async () => {
    const currentSchedule = schedules.find(s => s.id === scheduleId)
    if (!currentSchedule) {
      setScheduleError('Schedule not found')
      return
    }
    setScheduleLoading(true)
    setScheduleError(null)
    try {
      if (currentSchedule.is_active) {
        await pauseSchedule(scheduleId)
      } else {
        await resumeSchedule(scheduleId)
      }
      await loadSchedules()
    } catch {
      setScheduleError('Failed to toggle schedule')
    }
    setScheduleLoading(false)
  }

  const handleTriggerNow = async () => {
    setScheduleLoading(true)
    try {
      const result = await triggerScheduleNow(scheduleId)
      if (result.success) {
        setStatusMessage({ type: 'success', text: 'Schedule triggered manually' })
        setTimeout(() => loadScheduleLogs(), 3000)
      } else {
        setScheduleError(result.error ?? 'Failed to trigger')
      }
    } catch {
      setScheduleError('Failed to trigger schedule')
    }
    setScheduleLoading(false)
  }

  // ---- COMPUTED VALUES ----
  const todayTasks = tasks.filter(t => t.status === 'today')
  const upcomingTasks = tasks.filter(t => t.status === 'upcoming')
  const completedTasks = tasks.filter(t => t.status === 'completed')
  const unreadCount = notifications.filter(n => !n.read).length

  const filteredToday = filterPriority === 'all' ? todayTasks : todayTasks.filter(t => t.priority === filterPriority)
  const filteredUpcoming = filterPriority === 'all' ? upcomingTasks : upcomingTasks.filter(t => t.priority === filterPriority)
  const filteredCompleted = filterPriority === 'all' ? completedTasks : completedTasks.filter(t => t.priority === filterPriority)

  const currentSchedule = schedules.find(s => s.id === scheduleId)

  // Insights computations
  const urgentCount = tasks.filter(t => t.priority === 'urgent' && t.status !== 'completed').length
  const highCount = tasks.filter(t => t.priority === 'high' && t.status !== 'completed').length
  const mediumCount = tasks.filter(t => t.priority === 'medium' && t.status !== 'completed').length
  const lowCount = tasks.filter(t => t.priority === 'low' && t.status !== 'completed').length
  const totalActive = tasks.filter(t => t.status !== 'completed').length
  const completionRate = tasks.length > 0 ? Math.round((completedTasks.length / tasks.length) * 100) : 0
  const productivityScore = Math.min(100, completionRate + (tasks.length > 0 ? 20 : 0))

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <ErrorBoundary>
      <div style={THEME_VARS} className="min-h-screen bg-background text-foreground font-sans">
        {/* Background gradient overlay */}
        <div className="fixed inset-0 pointer-events-none" style={{ background: 'linear-gradient(135deg, hsl(120 25% 96%) 0%, hsl(140 30% 94%) 35%, hsl(160 25% 95%) 70%, hsl(100 20% 96%) 100%)' }} />

        <div className="relative flex h-screen overflow-hidden">

          {/* ---- SIDEBAR ---- */}
          <aside className={`${sidebarOpen ? 'w-60' : 'w-16'} flex-shrink-0 border-r border-border transition-all duration-300 flex flex-col`} style={{ backgroundColor: 'hsl(120 15% 95%)' }}>
            <div className="p-4 flex items-center gap-3">
              <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
                {sidebarOpen ? <FiChevronLeft className="w-5 h-5 text-foreground" /> : <FiMenu className="w-5 h-5 text-foreground" />}
              </button>
              {sidebarOpen && (
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'hsl(142 76% 26%)' }}>
                    <FiZap className="w-4 h-4 text-white" />
                  </div>
                  <span className="font-semibold text-foreground text-lg">SmartTask</span>
                </div>
              )}
            </div>
            <Separator />
            <nav className="flex-1 p-3 space-y-1">
              {[
                { key: 'dashboard' as const, icon: FiHome, label: 'Dashboard' },
                { key: 'insights' as const, icon: FiBarChart2, label: 'Insights' },
                { key: 'settings' as const, icon: FiSettings, label: 'Settings' },
              ].map(item => (
                <button
                  key={item.key}
                  onClick={() => setActiveNav(item.key)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${activeNav === item.key ? 'text-white shadow-md' : 'text-foreground hover:bg-secondary'}`}
                  style={activeNav === item.key ? { backgroundColor: 'hsl(142 76% 26%)' } : undefined}
                >
                  <item.icon className="w-5 h-5 flex-shrink-0" />
                  {sidebarOpen && <span>{item.label}</span>}
                </button>
              ))}
            </nav>
            {sidebarOpen && (
              <div className="p-3 border-t border-border">
                <div className="text-xs text-muted-foreground mb-2">AI Agents</div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs">
                    <div className={`w-2 h-2 rounded-full ${activeAgentId === TASK_AGENT_ID ? 'bg-green-500 animate-pulse' : 'bg-muted-foreground'}`} />
                    <span className="text-foreground truncate">Task Intelligence</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <div className={`w-2 h-2 rounded-full ${activeAgentId === REMINDER_AGENT_ID ? 'bg-green-500 animate-pulse' : 'bg-muted-foreground'}`} />
                    <span className="text-foreground truncate">Smart Reminder</span>
                  </div>
                </div>
              </div>
            )}
          </aside>

          {/* ---- MAIN CONTENT ---- */}
          <div className="flex-1 flex flex-col overflow-hidden">

            {/* ---- HEADER ---- */}
            <header className="flex-shrink-0 h-16 border-b border-border flex items-center justify-between px-6" style={{ backgroundColor: 'hsla(120, 15%, 96%, 0.85)', backdropFilter: 'blur(16px)' }}>
              <div className="flex items-center gap-4 flex-1">
                <div className="relative max-w-sm w-full">
                  <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="Search tasks..." className="pl-9 h-9 bg-secondary border-border text-sm" style={{ borderRadius: '10px' }} />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <Label htmlFor="sample-toggle" className="text-xs text-muted-foreground">Sample Data</Label>
                  <Switch id="sample-toggle" checked={sampleDataOn} onCheckedChange={setSampleDataOn} />
                </div>
                <div className="relative">
                  <button onClick={() => setShowNotifications(!showNotifications)} className="p-2 rounded-lg hover:bg-secondary transition-colors relative">
                    <FiBell className="w-5 h-5 text-foreground" />
                    {unreadCount > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full text-white text-xs flex items-center justify-center font-bold" style={{ backgroundColor: 'hsl(0 84% 60%)', fontSize: '10px' }}>
                        {unreadCount}
                      </span>
                    )}
                  </button>
                  {/* Notification dropdown */}
                  {showNotifications && (
                    <div className="absolute right-0 top-12 w-80 border border-border rounded-xl shadow-xl z-50 overflow-hidden" style={{ backgroundColor: 'hsl(120 15% 96%)', borderRadius: '14px' }}>
                      <div className="p-3 border-b border-border flex justify-between items-center">
                        <h4 className="font-semibold text-sm">Notifications</h4>
                        <button onClick={() => { setNotifications(prev => prev.map(n => ({ ...n, read: true }))); setShowNotifications(false) }} className="text-xs text-muted-foreground hover:text-foreground">
                          Mark all read
                        </button>
                      </div>
                      <ScrollArea className="max-h-72">
                        {notifications.length === 0 ? (
                          <div className="p-4 text-center text-sm text-muted-foreground">No notifications yet</div>
                        ) : (
                          notifications.slice(0, 5).map(n => (
                            <div key={n.id} className={`p-3 border-b border-border hover:bg-secondary transition-colors cursor-pointer ${!n.read ? 'bg-green-50/50' : ''}`} onClick={() => setNotifications(prev => prev.map(nn => nn.id === n.id ? { ...nn, read: true } : nn))}>
                              <div className="flex items-start gap-2">
                                <FiAlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: priorityColor(n.priority) }} />
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium text-foreground">{n.taskName}</p>
                                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
                                  {n.suggestedAction && (
                                    <p className="text-xs mt-1 font-medium" style={{ color: 'hsl(142 76% 26%)' }}>{n.suggestedAction}</p>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </ScrollArea>
                      <div className="p-2 border-t border-border">
                        <Button variant="ghost" size="sm" className="w-full text-xs" onClick={triggerReminders}>
                          <FiRefreshCw className="w-3 h-3 mr-1" /> Check for Reminders
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </header>

            {/* ---- STATUS MESSAGE ---- */}
            {statusMessage && (
              <div className={`mx-6 mt-3 p-3 rounded-lg text-sm flex items-center gap-2 ${statusMessage.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : statusMessage.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-blue-50 text-blue-700 border border-blue-200'}`} style={{ borderRadius: '10px' }}>
                {statusMessage.type === 'success' && <FiCheckCircle className="w-4 h-4 flex-shrink-0" />}
                {statusMessage.type === 'error' && <FiAlertTriangle className="w-4 h-4 flex-shrink-0" />}
                {statusMessage.type === 'info' && <FiAlertCircle className="w-4 h-4 flex-shrink-0" />}
                <span>{statusMessage.text}</span>
                <button onClick={() => setStatusMessage(null)} className="ml-auto"><FiX className="w-4 h-4" /></button>
              </div>
            )}

            {/* ---- CONTENT AREA ---- */}
            <main className="flex-1 overflow-y-auto p-6">

              {/* ==================== DASHBOARD ==================== */}
              {activeNav === 'dashboard' && (
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
                      <p className="text-sm text-muted-foreground mt-1">Manage your tasks and get AI-powered insights</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={analyzeTasks} disabled={chatLoading || tasks.filter(t => t.status !== 'completed').length === 0} style={{ borderRadius: '10px' }}>
                        {chatLoading && activeAgentId === TASK_AGENT_ID ? <FiLoader className="w-4 h-4 mr-2 animate-spin" /> : <FiZap className="w-4 h-4 mr-2" />}
                        Analyze Tasks
                      </Button>
                      <Button size="sm" onClick={() => setShowAddModal(true)} style={{ backgroundColor: 'hsl(142 76% 26%)', borderRadius: '10px' }}>
                        <FiPlus className="w-4 h-4 mr-1" /> Add Task
                      </Button>
                    </div>
                  </div>

                  {/* Quick Filters */}
                  <div className="flex gap-2 mb-5 flex-wrap">
                    {['all', 'urgent', 'high', 'medium', 'low'].map(p => (
                      <button
                        key={p}
                        onClick={() => setFilterPriority(p)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-all ${filterPriority === p ? 'text-white border-transparent shadow-sm' : 'bg-card text-foreground border-border hover:bg-secondary'}`}
                        style={filterPriority === p ? { backgroundColor: p === 'all' ? 'hsl(142 76% 26%)' : priorityColor(p) } : undefined}
                      >
                        {p === 'all' ? 'All' : p.charAt(0).toUpperCase() + p.slice(1)}
                      </button>
                    ))}
                  </div>

                  {/* Kanban Columns */}
                  {tasks.length === 0 ? (
                    <Card className="border border-border" style={{ borderRadius: '14px' }}>
                      <CardContent className="py-16 text-center">
                        <FiList className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                        <h3 className="text-lg font-medium text-foreground mb-2">No tasks yet</h3>
                        <p className="text-sm text-muted-foreground mb-4">Add your first task to get started, or enable Sample Data to explore the app.</p>
                        <Button onClick={() => setShowAddModal(true)} style={{ backgroundColor: 'hsl(142 76% 26%)', borderRadius: '10px' }}>
                          <FiPlus className="w-4 h-4 mr-1" /> Add Task
                        </Button>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      {/* Today */}
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: 'hsl(142 76% 26%)' }} />
                          <h3 className="font-semibold text-sm text-foreground">Today</h3>
                          <Badge variant="secondary" className="text-xs">{filteredToday.length}</Badge>
                        </div>
                        <div className="space-y-0">
                          {filteredToday.length === 0 ? (
                            <div className="p-4 text-center text-xs text-muted-foreground bg-card rounded-xl border border-border">No tasks for today</div>
                          ) : (
                            filteredToday.map(t => <TaskCard key={t.id} task={t} onComplete={completeTask} onToggleSubtask={toggleSubtask} onDelete={deleteTask} />)
                          )}
                        </div>
                      </div>

                      {/* Upcoming */}
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: 'hsl(160 60% 30%)' }} />
                          <h3 className="font-semibold text-sm text-foreground">Upcoming</h3>
                          <Badge variant="secondary" className="text-xs">{filteredUpcoming.length}</Badge>
                        </div>
                        <div className="space-y-0">
                          {filteredUpcoming.length === 0 ? (
                            <div className="p-4 text-center text-xs text-muted-foreground bg-card rounded-xl border border-border">No upcoming tasks</div>
                          ) : (
                            filteredUpcoming.map(t => <TaskCard key={t.id} task={t} onComplete={completeTask} onToggleSubtask={toggleSubtask} onDelete={deleteTask} />)
                          )}
                        </div>
                      </div>

                      {/* Completed */}
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-2 h-2 rounded-full bg-muted-foreground" />
                          <h3 className="font-semibold text-sm text-foreground">Completed</h3>
                          <Badge variant="secondary" className="text-xs">{filteredCompleted.length}</Badge>
                        </div>
                        <div className="space-y-0">
                          {filteredCompleted.length === 0 ? (
                            <div className="p-4 text-center text-xs text-muted-foreground bg-card rounded-xl border border-border">No completed tasks yet</div>
                          ) : (
                            filteredCompleted.map(t => <TaskCard key={t.id} task={t} onComplete={completeTask} onToggleSubtask={toggleSubtask} onDelete={deleteTask} />)
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ==================== INSIGHTS ==================== */}
              {activeNav === 'insights' && (
                <div>
                  <div className="mb-6">
                    <h1 className="text-2xl font-semibold text-foreground">Insights</h1>
                    <p className="text-sm text-muted-foreground mt-1">Productivity analytics and workload distribution</p>
                  </div>

                  {tasks.length === 0 ? (
                    <Card className="border border-border" style={{ borderRadius: '14px' }}>
                      <CardContent className="py-16 text-center">
                        <FiBarChart2 className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                        <h3 className="text-lg font-medium text-foreground mb-2">No data to display</h3>
                        <p className="text-sm text-muted-foreground">Add tasks or enable Sample Data to see productivity insights.</p>
                      </CardContent>
                    </Card>
                  ) : (
                    <>
                      {/* Stat Cards */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                        <Card className="border border-border" style={{ borderRadius: '14px' }}>
                          <CardContent className="p-5">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Completed</p>
                                <p className="text-3xl font-bold text-foreground mt-1">{completedTasks.length}</p>
                                <p className="text-xs text-muted-foreground mt-1">of {tasks.length} total tasks</p>
                              </div>
                              <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'hsl(142 76% 26% / 0.1)' }}>
                                <FiCheckCircle className="w-6 h-6" style={{ color: 'hsl(142 76% 26%)' }} />
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                        <Card className="border border-border" style={{ borderRadius: '14px' }}>
                          <CardContent className="p-5">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Active Tasks</p>
                                <p className="text-3xl font-bold text-foreground mt-1">{totalActive}</p>
                                <p className="text-xs text-muted-foreground mt-1">requiring attention</p>
                              </div>
                              <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'hsl(160 60% 30% / 0.1)' }}>
                                <FiActivity className="w-6 h-6" style={{ color: 'hsl(160 60% 30%)' }} />
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                        <Card className="border border-border" style={{ borderRadius: '14px' }}>
                          <CardContent className="p-5">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Urgent Items</p>
                                <p className="text-3xl font-bold mt-1" style={{ color: urgentCount > 0 ? 'hsl(0 84% 60%)' : undefined }}>{urgentCount}</p>
                                <p className="text-xs text-muted-foreground mt-1">need immediate action</p>
                              </div>
                              <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'hsl(0 84% 60% / 0.1)' }}>
                                <FiAlertTriangle className="w-6 h-6" style={{ color: 'hsl(0 84% 60%)' }} />
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                        <Card className="border border-border" style={{ borderRadius: '14px' }}>
                          <CardContent className="p-5">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Productivity</p>
                                <p className="text-3xl font-bold text-foreground mt-1">{productivityScore}%</p>
                                <p className="text-xs text-muted-foreground mt-1">completion rate</p>
                              </div>
                              <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'hsl(100 50% 40% / 0.1)' }}>
                                <FiTrendingUp className="w-6 h-6" style={{ color: 'hsl(100 50% 40%)' }} />
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Workload Distribution */}
                        <Card className="border border-border" style={{ borderRadius: '14px' }}>
                          <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-semibold">Workload Distribution</CardTitle>
                            <CardDescription className="text-xs">Tasks by priority level</CardDescription>
                          </CardHeader>
                          <CardContent>
                            <div className="space-y-4">
                              {[
                                { label: 'Urgent', count: urgentCount, color: 'hsl(0 84% 60%)', bg: 'hsl(0 84% 60% / 0.15)' },
                                { label: 'High', count: highCount, color: 'hsl(25 95% 53%)', bg: 'hsl(25 95% 53% / 0.15)' },
                                { label: 'Medium', count: mediumCount, color: 'hsl(48 96% 53%)', bg: 'hsl(48 96% 53% / 0.15)' },
                                { label: 'Low', count: lowCount, color: 'hsl(142 76% 36%)', bg: 'hsl(142 76% 36% / 0.15)' },
                              ].map(item => {
                                const pct = totalActive > 0 ? (item.count / totalActive) * 100 : 0
                                return (
                                  <div key={item.label}>
                                    <div className="flex justify-between items-center mb-1.5">
                                      <span className="text-xs font-medium text-foreground">{item.label}</span>
                                      <span className="text-xs text-muted-foreground">{item.count} tasks ({Math.round(pct)}%)</span>
                                    </div>
                                    <div className="w-full h-3 rounded-full overflow-hidden" style={{ backgroundColor: item.bg }}>
                                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: item.color }} />
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </CardContent>
                        </Card>

                        {/* Completion Trend (bar chart) */}
                        <Card className="border border-border" style={{ borderRadius: '14px' }}>
                          <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-semibold">Task Status Overview</CardTitle>
                            <CardDescription className="text-xs">Distribution across columns</CardDescription>
                          </CardHeader>
                          <CardContent>
                            <div className="flex items-end gap-6 h-40 justify-center">
                              {[
                                { label: 'Today', count: todayTasks.length, color: 'hsl(142 76% 26%)' },
                                { label: 'Upcoming', count: upcomingTasks.length, color: 'hsl(160 60% 30%)' },
                                { label: 'Done', count: completedTasks.length, color: 'hsl(100 50% 40%)' },
                              ].map(col => {
                                const maxCount = Math.max(todayTasks.length, upcomingTasks.length, completedTasks.length, 1)
                                const height = (col.count / maxCount) * 120
                                return (
                                  <div key={col.label} className="flex flex-col items-center gap-2">
                                    <span className="text-sm font-bold text-foreground">{col.count}</span>
                                    <div className="w-14 rounded-t-lg transition-all duration-500" style={{ height: `${Math.max(height, 8)}px`, backgroundColor: col.color }} />
                                    <span className="text-xs text-muted-foreground">{col.label}</span>
                                  </div>
                                )
                              })}
                            </div>
                          </CardContent>
                        </Card>

                        {/* Completion progress */}
                        <Card className="border border-border lg:col-span-2" style={{ borderRadius: '14px' }}>
                          <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-semibold">Overall Completion</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="flex items-center gap-4">
                              <Progress value={completionRate} className="flex-1 h-4" />
                              <span className="text-lg font-bold text-foreground">{completionRate}%</span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-2">{completedTasks.length} of {tasks.length} tasks completed</p>
                          </CardContent>
                        </Card>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* ==================== SETTINGS ==================== */}
              {activeNav === 'settings' && (
                <div>
                  <div className="mb-6">
                    <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
                    <p className="text-sm text-muted-foreground mt-1">Configure reminders, notifications, and AI preferences</p>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Schedule Management */}
                    <Card className="border border-border lg:col-span-2" style={{ borderRadius: '14px' }}>
                      <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                          <FiClock className="w-5 h-5" style={{ color: 'hsl(142 76% 26%)' }} />
                          Schedule Management
                        </CardTitle>
                        <CardDescription>Smart Reminder Agent runs on a schedule to check your tasks</CardDescription>
                      </CardHeader>
                      <CardContent>
                        {scheduleLoading && !currentSchedule ? (
                          <div className="space-y-3">
                            <Skeleton className="h-4 w-48" />
                            <Skeleton className="h-8 w-full" />
                            <Skeleton className="h-4 w-32" />
                          </div>
                        ) : scheduleError && !currentSchedule ? (
                          <div className="flex items-center gap-2 text-sm text-destructive">
                            <FiAlertCircle className="w-4 h-4" />
                            <span>{scheduleError}</span>
                            <Button variant="outline" size="sm" onClick={loadSchedules} className="ml-2">Retry</Button>
                          </div>
                        ) : (
                          <div className="space-y-4">
                            <div className="flex items-center justify-between p-4 bg-secondary rounded-xl">
                              <div>
                                <p className="text-sm font-medium text-foreground">Reminder Schedule</p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {currentSchedule?.cron_expression ? cronToHuman(currentSchedule.cron_expression) : 'Every 2 hours'}
                                </p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  Timezone: {currentSchedule?.timezone ?? 'UTC'}
                                </p>
                              </div>
                              <div className="flex items-center gap-3">
                                <div className={`px-2.5 py-1 rounded-full text-xs font-medium ${currentSchedule?.is_active ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                  {currentSchedule?.is_active ? 'Active' : 'Paused'}
                                </div>
                                <Switch
                                  checked={currentSchedule?.is_active ?? false}
                                  onCheckedChange={handleToggleSchedule}
                                  disabled={scheduleLoading}
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                              <div className="p-3 bg-card rounded-xl border border-border">
                                <p className="text-xs text-muted-foreground">Next Run</p>
                                <p className="text-sm font-medium text-foreground mt-1">
                                  {currentSchedule?.next_run_time ? new Date(currentSchedule.next_run_time).toLocaleString() : 'Not scheduled'}
                                </p>
                              </div>
                              <div className="p-3 bg-card rounded-xl border border-border">
                                <p className="text-xs text-muted-foreground">Last Run</p>
                                <p className="text-sm font-medium text-foreground mt-1">
                                  {currentSchedule?.last_run_at ? new Date(currentSchedule.last_run_at).toLocaleString() : 'Never'}
                                </p>
                              </div>
                              <div className="p-3 bg-card rounded-xl border border-border">
                                <p className="text-xs text-muted-foreground">Last Status</p>
                                <p className="text-sm font-medium text-foreground mt-1">
                                  {currentSchedule?.last_run_success === true ? 'Success' : currentSchedule?.last_run_success === false ? 'Failed' : 'N/A'}
                                </p>
                              </div>
                            </div>

                            <div className="flex gap-2">
                              <Button variant="outline" size="sm" onClick={handleTriggerNow} disabled={scheduleLoading} style={{ borderRadius: '10px' }}>
                                {scheduleLoading ? <FiLoader className="w-4 h-4 mr-1 animate-spin" /> : <FiPlay className="w-4 h-4 mr-1" />}
                                Run Now
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => { loadSchedules(); loadScheduleLogs() }} disabled={scheduleLoading} style={{ borderRadius: '10px' }}>
                                <FiRefreshCw className="w-4 h-4 mr-1" /> Refresh
                              </Button>
                            </div>

                            {scheduleError && (
                              <div className="text-xs text-destructive flex items-center gap-1">
                                <FiAlertCircle className="w-3 h-3" /> {scheduleError}
                              </div>
                            )}

                            {/* Execution Logs */}
                            {scheduleLogs.length > 0 && (
                              <div>
                                <h4 className="text-sm font-semibold text-foreground mb-2">Recent Executions</h4>
                                <div className="space-y-2 max-h-48 overflow-y-auto">
                                  {scheduleLogs.map(log => (
                                    <div key={log.id} className="flex items-center gap-3 p-2.5 bg-card rounded-lg border border-border text-xs">
                                      {log.success ? (
                                        <FiCheckCircle className="w-4 h-4 flex-shrink-0" style={{ color: 'hsl(142 76% 26%)' }} />
                                      ) : (
                                        <FiAlertCircle className="w-4 h-4 flex-shrink-0 text-destructive" />
                                      )}
                                      <div className="flex-1 min-w-0">
                                        <span className="text-foreground">{log.success ? 'Success' : 'Failed'}</span>
                                        {log.error_message && <span className="text-destructive ml-2">{log.error_message}</span>}
                                      </div>
                                      <span className="text-muted-foreground flex-shrink-0">{new Date(log.executed_at).toLocaleString()}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Notification Preferences */}
                    <Card className="border border-border" style={{ borderRadius: '14px' }}>
                      <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                          <FiBell className="w-5 h-5" style={{ color: 'hsl(142 76% 26%)' }} />
                          Notification Preferences
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <Label className="text-sm font-medium">In-App Notifications</Label>
                            <p className="text-xs text-muted-foreground">Show reminder alerts in the notification panel</p>
                          </div>
                          <Switch checked={inAppNotifs} onCheckedChange={setInAppNotifs} />
                        </div>
                        <Separator />
                        <div className="flex items-center justify-between">
                          <div>
                            <Label className="text-sm font-medium">Sound Alerts</Label>
                            <p className="text-xs text-muted-foreground">Play a sound when new reminders arrive</p>
                          </div>
                          <Switch checked={soundAlerts} onCheckedChange={setSoundAlerts} />
                        </div>
                        <Separator />
                        <div className="flex items-center justify-between">
                          <div>
                            <Label className="text-sm font-medium">Quiet Hours</Label>
                            <p className="text-xs text-muted-foreground">Suppress notifications during off-hours</p>
                          </div>
                          <Switch checked={quietHours} onCheckedChange={setQuietHours} />
                        </div>
                      </CardContent>
                    </Card>

                    {/* AI Preferences */}
                    <Card className="border border-border" style={{ borderRadius: '14px' }}>
                      <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                          <FiZap className="w-5 h-5" style={{ color: 'hsl(142 76% 26%)' }} />
                          AI Preferences
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <Label className="text-sm font-medium">Auto Priority Suggestions</Label>
                            <p className="text-xs text-muted-foreground">AI automatically suggests priority levels</p>
                          </div>
                          <Switch checked={autoPriority} onCheckedChange={setAutoPriority} />
                        </div>
                        <Separator />
                        <div>
                          <Label className="text-sm font-medium mb-2 block">Default Task Breakdown</Label>
                          <p className="text-xs text-muted-foreground mb-2">How deep should AI break down tasks</p>
                          <Select defaultValue="moderate">
                            <SelectTrigger className="w-full" style={{ borderRadius: '10px' }}>
                              <SelectValue placeholder="Select depth" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="minimal">Minimal (2-3 subtasks)</SelectItem>
                              <SelectItem value="moderate">Moderate (4-6 subtasks)</SelectItem>
                              <SelectItem value="detailed">Detailed (7+ subtasks)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              )}
            </main>
          </div>

          {/* ---- CHAT PANEL ---- */}
          {chatOpen ? (
            <div className="w-96 flex-shrink-0 border-l border-border flex flex-col" style={{ backgroundColor: 'hsl(120 15% 96%)' }}>
              <div className="p-4 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'hsl(142 76% 26%)' }}>
                    <FiMessageSquare className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">AI Assistant</h3>
                    <p className="text-xs text-muted-foreground">
                      {activeAgentId === TASK_AGENT_ID ? 'Analyzing...' : activeAgentId === REMINDER_AGENT_ID ? 'Checking reminders...' : 'Ready'}
                    </p>
                  </div>
                </div>
                <button onClick={() => setChatOpen(false)} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
                  <FiX className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>

              <ScrollArea className="flex-1 p-4">
                <div className="space-y-4">
                  {chatMessages.length === 0 && (
                    <div className="text-center py-8">
                      <FiMessageSquare className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
                      <p className="text-sm text-muted-foreground">Ask me about your tasks, priorities, or productivity tips.</p>
                      <div className="mt-4 space-y-2">
                        <button onClick={() => sendChatMessage('What tasks should I focus on today?')} className="w-full text-left text-xs p-2.5 bg-secondary rounded-lg hover:bg-muted transition-colors text-foreground">
                          What tasks should I focus on today?
                        </button>
                        <button onClick={() => sendChatMessage('Give me productivity tips for managing my workload')} className="w-full text-left text-xs p-2.5 bg-secondary rounded-lg hover:bg-muted transition-colors text-foreground">
                          Give me productivity tips
                        </button>
                        <button onClick={() => sendChatMessage('Help me prioritize my urgent tasks')} className="w-full text-left text-xs p-2.5 bg-secondary rounded-lg hover:bg-muted transition-colors text-foreground">
                          Help me prioritize urgent tasks
                        </button>
                      </div>
                    </div>
                  )}
                  {chatMessages.map(msg => (
                    <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] p-3 text-sm ${msg.role === 'user' ? 'text-white rounded-2xl rounded-br-md' : 'bg-card rounded-2xl rounded-bl-md border border-border text-foreground'}`} style={msg.role === 'user' ? { backgroundColor: 'hsl(142 76% 26%)', borderRadius: '14px 14px 4px 14px' } : { borderRadius: '14px 14px 14px 4px' }}>
                        {msg.role === 'assistant' ? renderMarkdown(msg.content) : <p>{msg.content}</p>}
                      </div>
                    </div>
                  ))}
                  {chatLoading && (
                    <div className="flex justify-start">
                      <div className="bg-card rounded-2xl rounded-bl-md border border-border p-3" style={{ borderRadius: '14px 14px 14px 4px' }}>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <FiLoader className="w-4 h-4 animate-spin" />
                          <span>Thinking...</span>
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
              </ScrollArea>

              <div className="p-3 border-t border-border">
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <Input
                      placeholder="Ask about tasks..."
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage() } }}
                      disabled={chatLoading}
                      className="pr-10 h-10 bg-secondary border-border text-sm"
                      style={{ borderRadius: '10px' }}
                    />
                  </div>
                  <Button size="sm" onClick={() => sendChatMessage()} disabled={chatLoading || !chatInput.trim()} className="h-10 w-10 p-0" style={{ backgroundColor: 'hsl(142 76% 26%)', borderRadius: '10px' }}>
                    <FiSend className="w-4 h-4" />
                  </Button>
                </div>
                <div className="flex gap-2 mt-2">
                  <Button variant="outline" size="sm" onClick={analyzeTasks} disabled={chatLoading || tasks.filter(t => t.status !== 'completed').length === 0} className="text-xs flex-1" style={{ borderRadius: '8px' }}>
                    <FiZap className="w-3 h-3 mr-1" /> Analyze Tasks
                  </Button>
                  <Button variant="outline" size="sm" onClick={triggerReminders} disabled={chatLoading || tasks.filter(t => t.status !== 'completed').length === 0} className="text-xs flex-1" style={{ borderRadius: '8px' }}>
                    <FiBell className="w-3 h-3 mr-1" /> Get Reminders
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <button onClick={() => setChatOpen(true)} className="fixed bottom-6 right-6 w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-white z-50 transition-all duration-200 hover:scale-105 hover:shadow-xl" style={{ backgroundColor: 'hsl(142 76% 26%)' }}>
              <FiMessageSquare className="w-6 h-6" />
            </button>
          )}
        </div>

        {/* ---- ADD TASK MODAL ---- */}
        <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
          <DialogContent className="sm:max-w-md" style={{ borderRadius: '14px' }}>
            <DialogHeader>
              <DialogTitle>Add New Task</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <Label htmlFor="task-title" className="text-sm font-medium">Title *</Label>
                <Input
                  id="task-title"
                  placeholder="Enter task title"
                  value={newTask.title}
                  onChange={(e) => setNewTask(prev => ({ ...prev, title: e.target.value }))}
                  className="mt-1"
                  style={{ borderRadius: '10px' }}
                />
              </div>
              <div>
                <Label htmlFor="task-desc" className="text-sm font-medium">Description</Label>
                <Textarea
                  id="task-desc"
                  placeholder="Describe the task..."
                  value={newTask.description}
                  onChange={(e) => setNewTask(prev => ({ ...prev, description: e.target.value }))}
                  className="mt-1"
                  rows={3}
                  style={{ borderRadius: '10px' }}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="task-deadline" className="text-sm font-medium">Deadline</Label>
                  <Input
                    id="task-deadline"
                    type="date"
                    value={newTask.deadline}
                    onChange={(e) => setNewTask(prev => ({ ...prev, deadline: e.target.value }))}
                    className="mt-1"
                    style={{ borderRadius: '10px' }}
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium">Priority</Label>
                  <Select value={newTask.priority} onValueChange={(v) => setNewTask(prev => ({ ...prev, priority: v as Task['priority'] }))}>
                    <SelectTrigger className="mt-1" style={{ borderRadius: '10px' }}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="urgent">Urgent</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label htmlFor="task-tags" className="text-sm font-medium">Tags (comma-separated)</Label>
                <Input
                  id="task-tags"
                  placeholder="e.g., development, design"
                  value={newTask.tags}
                  onChange={(e) => setNewTask(prev => ({ ...prev, tags: e.target.value }))}
                  className="mt-1"
                  style={{ borderRadius: '10px' }}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddModal(false)} style={{ borderRadius: '10px' }}>Cancel</Button>
              <Button onClick={addTask} disabled={!newTask.title.trim()} style={{ backgroundColor: 'hsl(142 76% 26%)', borderRadius: '10px' }}>Add Task</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Click outside to close notifications */}
        {showNotifications && (
          <div className="fixed inset-0 z-40" onClick={() => setShowNotifications(false)} />
        )}
      </div>
    </ErrorBoundary>
  )
}
