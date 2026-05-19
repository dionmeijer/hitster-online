export interface ReactionTime {
  min: number;
  max: number;
}

export type TokenStrategy = 'hoard' | 'spend' | 'balanced';

export interface BotProfile {
  name: string;
  avatar_color: string;
  knowledge: number;
  genre_affinities: string[];
  naming_willingness: number;
  challenge_rate: number;
  reaction_time_ms: ReactionTime;
  token_strategy: TokenStrategy;
  join_willingness: number;
}

export interface ProfilesFile {
  bots: BotProfile[];
}

export interface BotOptions {
  serverUrl: string;
  roomCode?: string;       // join existing room; omit to create
  count?: number;          // how many bots to spawn (default: all profiles)
  genre?: string;          // room genre label, used to resolve affinities
}
