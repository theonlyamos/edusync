import { Server as SocketServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { getServerSession } from '@/lib/auth';

interface CollaborationSession {
  sessionId: string;
  lessonId: string;
  participants: Array<{
    userId: string;
    role: 'teacher' | 'student';
    activeStatus: boolean;
  }>;
  sharedContent: {
    whiteboard: any;
    chat: any[];
    currentSlide: number;
  };
}

export class CollaborationServer {
  private io: SocketServer;
  private sessions: Map<string, CollaborationSession>;

  constructor(server: HTTPServer) {
    this.io = new SocketServer(server);
    this.sessions = new Map();
    this.setupSocketHandlers();
  }

  private setupSocketHandlers() {
    this.io.on('connection', async (socket) => {
      const session = await getServerSession();
      if (!session) {
        socket.disconnect();
        return;
      }

      socket.on('joinSession', (sessionId: string) => {
        this.handleJoinSession(socket, sessionId, session);
      });

      socket.on('updateContent', (data: any) => {
        this.handleContentUpdate(socket, data);
      });

      socket.on('disconnect', () => {
        this.handleDisconnect(socket);
      });
    });
  }

  private handleJoinSession(socket: any, sessionId: string, userSession: any) {
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = this.createNewSession(sessionId);
    }

    session.participants.push({
      userId: userSession.user.id,
      role: userSession.user.role,
      activeStatus: true
    });

    socket.join(sessionId);
    this.sessions.set(sessionId, session);
    this.io.to(sessionId).emit('participantJoined', {
      userId: userSession.user.id,
      role: userSession.user.role
    });
  }

  private createNewSession(sessionId: string): CollaborationSession {
    return {
      sessionId,
      lessonId: '',
      participants: [],
      sharedContent: {
        whiteboard: null,
        chat: [],
        currentSlide: 0
      }
    };
  }

  private handleContentUpdate(socket: any, data: any) {
    const { sessionId, content } = data;
    const session = this.sessions.get(sessionId);
    if (session) {
      session.sharedContent = { ...session.sharedContent, ...content };
      this.sessions.set(sessionId, session);
      socket.to(sessionId).emit('contentUpdated', content);
    }
  }

  private handleDisconnect(socket: any) {
    // Cleanup logic
  }
}