import { NextResponse } from 'next/server';
import {
  AccessToken,
  AgentDispatchClient,
  type AccessTokenOptions,
  type VideoGrant,
} from 'livekit-server-sdk';
import { RoomConfiguration } from '@livekit/protocol';

type ConnectionDetails = {
  serverUrl: string;
  roomName: string;
  participantName: string;
  participantToken: string;
};

// NOTE: you are expected to define the following environment variables in `.env.local`:
const API_KEY = process.env.LIVEKIT_API_KEY;
const API_SECRET = process.env.LIVEKIT_API_SECRET;
const LIVEKIT_URL = process.env.LIVEKIT_URL;
const AGENT_NAME = process.env.AGENT_NAME?.trim() || undefined;
const DISPATCH_AGENT_NAME = process.env.DISPATCH_AGENT_NAME?.trim() || undefined;

function isPlaceholder(value: string | undefined) {
  if (!value) return true;

  return (
    value.includes('your-livekit-server') ||
    value.includes('your_livekit') ||
    value.includes('<your_') ||
    value === 'your-livekit-api-key' ||
    value === 'your-livekit-api-secret'
  );
}

function sanitizeRoomConfig(input: unknown) {
  if (!input || typeof input !== 'object') {
    return undefined;
  }

  const roomConfig = structuredClone(input as Record<string, unknown>);

  if (Array.isArray(roomConfig.agents)) {
    roomConfig.agents = roomConfig.agents.map((agent) => {
      if (!agent || typeof agent !== 'object') {
        return agent;
      }

      const raw = agent as Record<string, unknown>;
      const sanitized: Record<string, unknown> = {};

      if (typeof raw.agentName === 'string' && raw.agentName) {
        sanitized.agentName = raw.agentName;
      }

      if (typeof raw.metadata === 'string' && raw.metadata) {
        sanitized.metadata = raw.metadata;
      }

      return sanitized;
    });
  }

  return roomConfig as Parameters<typeof RoomConfiguration.fromJson>[0];
}

function toServiceUrl(url: string) {
  if (url.startsWith('ws://')) {
    return `http://${url.slice(5)}`;
  }

  if (url.startsWith('wss://')) {
    return `https://${url.slice(6)}`;
  }

  return url;
}

// don't cache the results
export const revalidate = 0;

export async function POST(req: Request) {
  if (process.env.NODE_ENV !== 'development') {
    throw new Error(
      'THIS API ROUTE IS INSECURE. DO NOT USE THIS ROUTE IN PRODUCTION WITHOUT AN AUTHENTICATION LAYER.'
    );
  }

  try {
    if (LIVEKIT_URL === undefined || isPlaceholder(LIVEKIT_URL)) {
      throw new Error('LIVEKIT_URL is missing or still using the placeholder value');
    }
    if (API_KEY === undefined || isPlaceholder(API_KEY)) {
      throw new Error('LIVEKIT_API_KEY is missing or still using the placeholder value');
    }
    if (API_SECRET === undefined || isPlaceholder(API_SECRET)) {
      throw new Error('LIVEKIT_API_SECRET is missing or still using the placeholder value');
    }

    // Parse room config and participant metadata from request body.
    const body = await req.json();
    const sanitizedRoomConfig = sanitizeRoomConfig(body?.room_config);
    const roomConfig = sanitizedRoomConfig
      ? RoomConfiguration.fromJson(sanitizedRoomConfig, { ignoreUnknownFields: true })
      : new RoomConfiguration();
    const participantMetadata =
      typeof body?.participant_metadata === 'string' ? body.participant_metadata : '';

    // Generate participant token
    const participantName = 'user';
    const participantIdentity = `voice_assistant_user_${Math.floor(Math.random() * 10_000)}`;
    const roomName = `voice_assistant_room_${Math.floor(Math.random() * 10_000)}`;

    const participantToken = await createParticipantToken(
      { identity: participantIdentity, name: participantName, metadata: participantMetadata },
      roomName,
      roomConfig
    );

    const resolvedDispatchAgentName = DISPATCH_AGENT_NAME || AGENT_NAME;

    if (resolvedDispatchAgentName) {
      const dispatchClient = new AgentDispatchClient(toServiceUrl(LIVEKIT_URL), API_KEY, API_SECRET);
      await dispatchClient.createDispatch(roomName, resolvedDispatchAgentName, {
        metadata: participantMetadata,
      });
    }

    // Return connection details
    const data: ConnectionDetails = {
      serverUrl: LIVEKIT_URL,
      roomName,
      participantName,
      participantToken,
    };
    const headers = new Headers({
      'Cache-Control': 'no-store',
    });
    return NextResponse.json(data, { headers });
  } catch (error) {
    if (error instanceof Error) {
      console.error(error);
      return new NextResponse(error.message, { status: 500 });
    }
  }
}

function createParticipantToken(
  userInfo: AccessTokenOptions,
  roomName: string,
  roomConfig: RoomConfiguration | undefined
): Promise<string> {
  const at = new AccessToken(API_KEY, API_SECRET, {
    ...userInfo,
    ttl: '15m',
  });
  const grant: VideoGrant = {
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canPublishData: true,
    canSubscribe: true,
  };
  at.addGrant(grant);

  if (roomConfig) {
    at.roomConfig = roomConfig;
  }

  return at.toJwt();
}
