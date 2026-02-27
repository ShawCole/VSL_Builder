export interface AudioTrack {
  id: string;
  label: string;
  drive_file_id: string;
  order: number;
}

export interface Segment {
  label: string;
  duration: number;
  color: string;
}

export interface PlaybackState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  activeSegmentIndex: number;
  isLoading: boolean;
}

export interface FeedbackNote {
  id: string;
  note: string;
  section: string;
  status: "open" | "completed";
  timestamp: string;
  avatar: string;
  hookindex: number;
}
