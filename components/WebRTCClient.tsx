"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Controls from "@/components/controls";
import Scene from "@/components/scene";
import Logs from "@/components/logs";
import { INSTRUCTIONS, TOOLS } from "@/lib/config";
import { BASE_URL, MODEL } from "@/lib/constants";

type ToolCallOutput = {
  response: string;
  [key: string]: any;
};

export default function WebRTCClient() {
  const [logs, setLogs] = useState<any[]>([]);
  const [toolCall, setToolCall] = useState<any>(null);
  const [isSessionStarted, setIsSessionStarted] = useState(false);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [isListening, setIsListening] = useState(false);

  const [dataChannel, setDataChannel] = useState<RTCDataChannel | null>(null);
  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const audioElement = useRef<HTMLAudioElement | null>(null);
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);
  const audioTransceiver = useRef<RTCRtpTransceiver | null>(null);
  const tracks = useRef<RTCRtpSender[] | null>(null);

  // Start a new realtime session
  const startSession = useCallback(async () => {
    if (isSessionStarted) {
      return;
    }
    
    try {
      setIsSessionStarted(true);
      
      // Get TURN server configuration
      const iceServers = await fetch("/api/turn").then((response) =>
        response.json()
      );
      console.log("ICE Servers:", iceServers);
      
      // Get an ephemeral session token
      const session = await fetch("/api/session").then((response) =>
        response.json()
      );
      const sessionToken = session.client_secret.value;
      const sessionId = session.id;

      console.log("Session id:", sessionId);

      // Ensure we have audio access before creating the peer connection
      let audioStream: MediaStream | null = null;
      
      // Check for MediaDevices API
      if (!navigator.mediaDevices) {
        console.error("MediaDevices API not available in this environment");
        setIsSessionStarted(false);
        return; // Exit early as we can't proceed without audio
      }
      
      try {
        // Try to get user media with audio
        audioStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        setAudioStream(audioStream);
        console.log("Successfully obtained audio stream");
      } catch (mediaError) {
        console.error("Error accessing microphone:", mediaError);
        setIsSessionStarted(false);
        return; // Exit if we can't get audio access
      }

      // Create a peer connection with Metered's TURN servers
      const pc = new RTCPeerConnection({
        iceServers: iceServers
      });

      // Set up to play remote audio from the model
      if (!audioElement.current) {
        audioElement.current = document.createElement("audio");
      }
      audioElement.current.autoplay = true;
      pc.ontrack = (e) => {
        if (audioElement.current) {
          audioElement.current.srcObject = e.streams[0];
        }
      };

      // Log ICE connection state changes
      pc.oniceconnectionstatechange = () => {
        console.log("ICE connection state:", pc.iceConnectionState);
      };

      // Log ICE gathering state changes
      pc.onicegatheringstatechange = () => {
        console.log("ICE gathering state:", pc.iceGatheringState);
      };

      // Log ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          console.log("ICE candidate:", event.candidate.candidate);
          // We can see if TURN servers are being used by looking for "relay" in the candidate
          if (event.candidate.candidate.includes("relay")) {
            console.log("Using TURN relay server!");
          }
        }
      };

      // Add all audio tracks to the peer connection
      let trackAdded = false;
      if (audioStream) {
        const audioTracks = audioStream.getAudioTracks();
        if (audioTracks.length > 0) {
          audioTracks.forEach((track) => {
            const sender = pc.addTrack(track, audioStream!);
            if (sender) {
              tracks.current = [...(tracks.current || []), sender];
              trackAdded = true;
            }
          });
          console.log(`Added ${audioTracks.length} audio tracks to peer connection`);
        } else {
          console.warn("No audio tracks found in the stream");
        }
      }
      
      // If no tracks were added, we can't proceed - audio is required
      if (!trackAdded) {
        console.error("Failed to add audio tracks to peer connection");
        if (audioStream) {
          audioStream.getTracks().forEach(track => track.stop());
        }
        setIsSessionStarted(false);
        return;
      }

      // Set up data channel for sending and receiving events
      const dc = pc.createDataChannel("oai-events");
      setDataChannel(dc);

      // Start the session using the Session Description Protocol (SDP)
      console.log("Creating offer with audio tracks");
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,  // Explicitly request audio
        offerToReceiveVideo: false
      });
      
      // Verify that the offer includes audio
      if (!offer.sdp?.includes('m=audio')) {
        console.error("Generated offer does not contain audio section");
        stopSession();
        return;
      }
      
      console.log("Setting local description");
      await pc.setLocalDescription(offer);

      console.log("Sending SDP offer to OpenAI");
      const sdpResponse = await fetch(`${BASE_URL}?model=${MODEL}`, {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          "Content-Type": "application/sdp",
        },
      });

      if (!sdpResponse.ok) {
        const errorText = await sdpResponse.text();
        console.error("Error response from OpenAI:", errorText);
        stopSession();
        return;
      }

      const answerSdp = await sdpResponse.text();
      console.log("Received SDP answer from OpenAI");
      
      const answer: RTCSessionDescriptionInit = {
        type: "answer",
        sdp: answerSdp,
      };
      
      await pc.setRemoteDescription(answer);
      console.log("Set remote description");

      peerConnection.current = pc;
    } catch (error) {
      console.error("Error starting session:", error);
      stopSession();
    }
  }, [isSessionStarted]);

  // Stop current session, clean up peer connection and data channel
  const stopSession = useCallback(() => {
    if (dataChannel) {
      dataChannel.close();
    }
    if (peerConnection.current) {
      peerConnection.current.close();
    }

    setIsSessionStarted(false);
    setIsSessionActive(false);
    setDataChannel(null);
    peerConnection.current = null;
    if (audioStream) {
      audioStream.getTracks().forEach((track) => track.stop());
    }
    setAudioStream(null);
    setIsListening(false);
    audioTransceiver.current = null;
  }, [dataChannel, audioStream]);

  // Grabs a new mic track and replaces the placeholder track in the transceiver
  const startRecording = useCallback(async () => {
    try {
      // Check if peer connection exists
      if (!peerConnection.current) {
        console.warn("Cannot start recording: No peer connection established");
        return;
      }

      console.log("Requesting microphone access...");
      const newStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      
      if (!newStream || newStream.getAudioTracks().length === 0) {
        console.error("Failed to obtain audio tracks from microphone");
        return;
      }
      
      console.log(`Obtained ${newStream.getAudioTracks().length} audio tracks`);
      setAudioStream(newStream);

      // If we already have an audioSender, just replace its track:
      if (tracks.current && tracks.current.length > 0) {
        const micTrack = newStream.getAudioTracks()[0];
        console.log("Replacing existing audio track");
        let replaced = false;
        
        tracks.current.forEach((sender) => {
          replaced = true;
          sender.replaceTrack(micTrack);
        });
        
        if (!replaced) {
          console.warn("No senders found to replace track");
        }
      } else if (peerConnection.current) {
        // Fallback if audioSender somehow didn't get set
        console.log("Adding audio track to connection");
        let added = false;
        
        newStream.getTracks().forEach((track) => {
          const sender = peerConnection.current?.addTrack(track, newStream);
          if (sender) {
            added = true;
            tracks.current = [...(tracks.current || []), sender];
          }
        });
        
        if (!added) {
          console.warn("Failed to add tracks to connection");
          return;
        }
      } else {
        console.warn("No peer connection available to add tracks");
        return;
      }

      setIsListening(true);
      console.log("Microphone started successfully");
    } catch (error) {
      console.error("Error accessing microphone:", error);
    }
  }, []);

  // Replaces the mic track with a placeholder track
  const stopRecording = useCallback(() => {
    setIsListening(false);
    console.log("Stopping recording");

    // Stop existing mic tracks so the user's mic is off
    if (audioStream) {
      console.log("Stopping audio tracks");
      audioStream.getTracks().forEach((track) => {
        track.stop();
        console.log(`Stopped track: ${track.id}`);
      });
    }
    setAudioStream(null);

    // Replace with a placeholder (silent) track if we have senders
    if (tracks.current && tracks.current.length > 0) {
      try {
        console.log("Creating silent audio track");
        const placeholderTrack = createEmptyAudioTrack();
        
        console.log("Replacing with silent track");
        tracks.current.forEach((sender) => {
          sender.replaceTrack(placeholderTrack);
        });
        
        console.log("Microphone replaced with silent track");
      } catch (error) {
        console.error("Error creating silent track:", error);
      }
    } else {
      console.log("No audio senders to replace");
    }
  }, [audioStream]);

  // Creates a placeholder track that is silent
  function createEmptyAudioTrack(): MediaStreamTrack {
    try {
      // Create an audio context for generating a silent audio track
      const audioContext = new AudioContext();
      const oscillator = audioContext.createOscillator();
      const destination = audioContext.createMediaStreamDestination();
      
      // Connect oscillator to destination but set gain to 0 (silent)
      const gainNode = audioContext.createGain();
      gainNode.gain.value = 0;
      oscillator.connect(gainNode);
      gainNode.connect(destination);
      
      // Start the oscillator
      oscillator.start();
      
      return destination.stream.getAudioTracks()[0];
    } catch (error) {
      console.error("Failed to create empty audio track:", error);
      throw new Error("Failed to create silent audio track");
    }
  }

  // Send a message to the model
  const sendClientEvent = useCallback(
    (message: any) => {
      if (dataChannel) {
        message.event_id = message.event_id || crypto.randomUUID();
        dataChannel.send(JSON.stringify(message));
      } else {
        console.error(
          "Failed to send message - no data channel available",
          message
        );
      }
    },
    [dataChannel]
  );

  // Attach event listeners to the data channel when a new one is created
  useEffect(() => {
    if (!dataChannel) return;
    
    async function handleToolCall(output: any) {
      const toolCall = {
        name: output.name,
        arguments: output.arguments,
      };
      console.log("Tool call:", toolCall);
      setToolCall(toolCall);

      // TOOL CALL HANDLING
      // Initialize toolCallOutput with a default response
      const toolCallOutput: ToolCallOutput = {
        response: `Tool call ${toolCall.name} executed successfully.`,
      };

      // Handle special tool calls
      if (toolCall.name === "get_iss_position") {
        const issPosition = await fetch("/api/iss").then((response) =>
          response.json()
        );
        console.log("ISS position:", issPosition);
        toolCallOutput.issPosition = issPosition;
      }

      sendClientEvent({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: output.call_id,
          output: JSON.stringify(toolCallOutput),
        },
      });

      // Force a model response to make sure it responds after certain tool calls
      if (
        toolCall.name === "get_iss_position" ||
        toolCall.name === "display_data"
      ) {
        sendClientEvent({
          type: "response.create",
        });
      }
    }

    // Append new server events to the list
    dataChannel.addEventListener("message", (e) => {
      const event = JSON.parse(e.data);
      if (event.type === "response.done") {
        const output = event.response.output[0];
        setLogs((prev) => [output, ...prev]);
        if (output?.type === "function_call") {
          handleToolCall(output);
        }
      }
    });

    // Set session active when the data channel is opened
    dataChannel.addEventListener("open", () => {
      setIsSessionActive(true);
      setIsListening(true);
      setLogs([]);
      // Send session config
      const sessionUpdate = {
        type: "session.update",
        session: {
          tools: TOOLS,
          instructions: INSTRUCTIONS,
        },
      };
      sendClientEvent(sessionUpdate);
      console.log("Session update sent:", sessionUpdate);
    });

    // Cleanup function to remove event listeners when component unmounts
    return () => {
      // We can't remove the event listeners specifically since we'd need a reference to the
      // handler functions, so we'll rely on general cleanup in the stopSession function
    };
  }, [dataChannel, sendClientEvent]);

  const handleConnectClick = useCallback(() => {
    if (isSessionActive) {
      console.log("Stopping session.");
      stopSession();
    } else {
      console.log("Starting session.");
      startSession();
    }
  }, [isSessionActive, startSession, stopSession]);

  const handleMicToggleClick = useCallback(() => {
    if (isListening) {
      console.log("Stopping microphone.");
      stopRecording();
    } else {
      console.log("Starting microphone.");
      startRecording();
    }
  }, [isListening, startRecording, stopRecording]);

  return (
    <div className="relative size-full">
      <Scene toolCall={toolCall} />
      <Controls
        handleConnectClick={handleConnectClick}
        handleMicToggleClick={handleMicToggleClick}
        isConnected={isSessionActive}
        isListening={isListening}
      />
      <Logs messages={logs} />
    </div>
  );
} 