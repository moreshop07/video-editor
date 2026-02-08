import { create } from 'zustand';

export interface ConnectedUser {
  userId: number;
  username: string;
  color: string;
  selectedClipIds: string[];
  currentTime: number;
}

interface CollaborationState {
  connectedUsers: Record<number, ConnectedUser>;
  isCollaborative: boolean;

  setUsers: (users: Array<{ user_id: number; username: string; color: string }>) => void;
  addUser: (user: { user_id: number; username: string; color: string }) => void;
  removeUser: (userId: number) => void;
  updateUserSelection: (userId: number, clipIds: string[]) => void;
  updateUserCursor: (userId: number, time: number) => void;
  reset: () => void;
}

export const useCollaborationStore = create<CollaborationState>((set) => ({
  connectedUsers: {},
  isCollaborative: false,

  setUsers: (users) =>
    set(() => {
      const map: Record<number, ConnectedUser> = {};
      for (const u of users) {
        map[u.user_id] = {
          userId: u.user_id,
          username: u.username,
          color: u.color,
          selectedClipIds: [],
          currentTime: 0,
        };
      }
      return { connectedUsers: map, isCollaborative: Object.keys(map).length > 1 };
    }),

  addUser: (user) =>
    set((state) => {
      const updated = {
        ...state.connectedUsers,
        [user.user_id]: {
          userId: user.user_id,
          username: user.username,
          color: user.color,
          selectedClipIds: [],
          currentTime: 0,
        },
      };
      return { connectedUsers: updated, isCollaborative: Object.keys(updated).length > 1 };
    }),

  removeUser: (userId) =>
    set((state) => {
      const { [userId]: _, ...rest } = state.connectedUsers;
      return { connectedUsers: rest, isCollaborative: Object.keys(rest).length > 1 };
    }),

  updateUserSelection: (userId, clipIds) =>
    set((state) => {
      const user = state.connectedUsers[userId];
      if (!user) return state;
      return {
        connectedUsers: {
          ...state.connectedUsers,
          [userId]: { ...user, selectedClipIds: clipIds },
        },
      };
    }),

  updateUserCursor: (userId, time) =>
    set((state) => {
      const user = state.connectedUsers[userId];
      if (!user) return state;
      return {
        connectedUsers: {
          ...state.connectedUsers,
          [userId]: { ...user, currentTime: time },
        },
      };
    }),

  reset: () => set({ connectedUsers: {}, isCollaborative: false }),
}));
