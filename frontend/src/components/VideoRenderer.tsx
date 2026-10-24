import { useEffect, useRef } from 'react'
import type { VideoTrack } from 'livekit-client'

interface VideoRendererProps {
  track: VideoTrack | undefined
  label: string
  isLocal?: boolean
}

export function VideoRenderer({ track, label, isLocal = false }: VideoRendererProps) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (videoRef.current && track) {
      track.attach(videoRef.current)
      return () => {
        track.detach()
      }
    }
  }, [track])

  // Fallback for offline/preview: if local and no LiveKit track yet, attach camera directly
  useEffect(() => {
    if (track || !isLocal) return
    let activeStream: MediaStream | null = null

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices
        .getUserMedia({ video: true, audio: false })
        .then((stream) => {
          activeStream = stream
          if (videoRef.current) {
            videoRef.current.srcObject = stream
          }
        })
        .catch((err) => {
          console.warn("Local camera fallback notice:", err)
        })
    }

    return () => {
      if (activeStream) {
        activeStream.getTracks().forEach((t) => t.stop())
      }
    }
  }, [track, isLocal])

  return (
    <div className="video-container fullscreen-video-container">
      <video 
        ref={videoRef} 
        autoPlay 
        muted={isLocal} 
        playsInline 
        className="video-element fullscreen-video-element"
      />
      {label ? <div className="video-label">{label}</div> : null}
    </div>
  )
}


