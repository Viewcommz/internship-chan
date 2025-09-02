// API 응답 타입 
export interface HealthRes {
  status: string;
  uptime: number;
  timestamp: string;
}

export interface UppercaseRes {
  original: string;
  uppercased: string;
}

export interface RandomRes {
  min: number;
  max: number;
  value: number;
}