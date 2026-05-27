import React, { useEffect, useRef, useState } from 'react';

const rtcConfig: RTCConfiguration = {
  iceServers: [] 
};

type SignalingMessage = {
  type: 'join' | 'offer' | 'answer' | 'ice-candidate';
  sender: string;
  target?: string;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
};

export default function App() {
  const [isBroadcaster, setIsBroadcaster] = useState<boolean>(false);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const myIdRef = useRef<string>(Math.random().toString(36).substring(2, 9));
  
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const viewerPcRef = useRef<RTCPeerConnection | null>(null);

  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const hostname = window.location.hostname;
    const isBroadcasterMode = hostname === 'localhost' || hostname === '127.0.0.1';
    setIsBroadcaster(isBroadcasterMode);

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = async () => {
      console.log('WebSocket connected as:', isBroadcasterMode ? 'Broadcaster' : 'Viewer');
      
      if (isBroadcasterMode) {
        try {
          // ダミーのマイク権限を要求してmDNSによるIP隠蔽を解除する (Chrome用ハック)
          try {
            const dummyStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            dummyStream.getTracks().forEach(track => track.stop());
          } catch (e) {
            console.warn('マイク権限が取得できなかったため、ローカルIPが隠蔽される可能性があります', e);
          }

          const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
          localStreamRef.current = stream;
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
          }
        } catch (err) {
          console.error('Failed to get display media', err);
        }
      } else {
        sendMessage({ type: 'join', sender: myIdRef.current });
      }
    };

    ws.onmessage = async (event) => {
      const msg: SignalingMessage = JSON.parse(event.data);
      if (msg.target && msg.target !== myIdRef.current) return;

      if (isBroadcasterMode) {
        await handleBroadcasterMessage(msg);
      } else {
        await handleViewerMessage(msg);
      }
    };

    return () => {
      ws.close();
      localStreamRef.current?.getTracks().forEach(track => track.stop());
      peerConnectionsRef.current.forEach(pc => pc.close());
      viewerPcRef.current?.close();
    };
  }, []);

  const sendMessage = (msg: SignalingMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  };

  const handleBroadcasterMessage = async (msg: SignalingMessage) => {
    if (msg.type === 'join') {
      const viewerId = msg.sender;
      const pc = new RTCPeerConnection(rtcConfig);
      peerConnectionsRef.current.set(viewerId, pc);

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          sendMessage({ type: 'ice-candidate', sender: myIdRef.current, target: viewerId, candidate: e.candidate });
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log(`[Broadcaster] ICE Connection State for ${viewerId}:`, pc.iceConnectionState);
      };

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => {
          pc.addTrack(track, localStreamRef.current!);
        });
      }

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendMessage({ type: 'offer', sender: myIdRef.current, target: viewerId, sdp: offer });
    } 
    else if (msg.type === 'answer' && msg.sdp) {
      const pc = peerConnectionsRef.current.get(msg.sender);
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
      }
    } 
    else if (msg.type === 'ice-candidate' && msg.candidate) {
      const pc = peerConnectionsRef.current.get(msg.sender);
      if (pc) {
        await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
      }
    }
  };

  const handleViewerMessage = async (msg: SignalingMessage) => {
    if (msg.type === 'offer' && msg.sdp) {
      const pc = new RTCPeerConnection(rtcConfig);
      viewerPcRef.current = pc;

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          sendMessage({ type: 'ice-candidate', sender: myIdRef.current, target: msg.sender, candidate: e.candidate });
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log('[Viewer] ICE Connection State:', pc.iceConnectionState);
      };

      pc.ontrack = (e) => {
        if (remoteVideoRef.current && e.streams[0]) {
          remoteVideoRef.current.srcObject = e.streams[0];
        }
      };

      await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendMessage({ type: 'answer', sender: myIdRef.current, target: msg.sender, sdp: answer });
    } 
    else if (msg.type === 'ice-candidate' && msg.candidate) {
      if (viewerPcRef.current) {
        await viewerPcRef.current.addIceCandidate(new RTCIceCandidate(msg.candidate));
      }
    }
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h2>{isBroadcaster ? '配信者モード (あなたの画面を共有中)' : '視聴者モード (画面を受信中)'}</h2>
      
      {isBroadcaster ? (
        <video 
          ref={localVideoRef} 
          autoPlay 
          muted 
          style={{ width: '80%', border: '2px solid #007bff' }} 
        />
      ) : (
        <video 
          ref={remoteVideoRef} 
          autoPlay 
          controls 
          style={{ width: '80%', border: '2px solid #28a745' }} 
        />
      )}
    </div>
  );
}