class WebRTCClient {
    constructor() {
        
        this.socket = io();
        
        this.rtcConfig = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        };
        
       
        this.peerConnections = new Map();
        this.localStream = null;
        this.currentRoom = null;
        this.isVideoEnabled = true;
        this.isAudioEnabled = true;
        
        this.initializeElements();
        this.setupEventListeners();
        this.setupSocketEvents();
    }
    
    initializeElements() {
        
        this.roomIdInput = document.getElementById('room-id');
        this.joinBtn = document.getElementById('join-btn');
        this.createBtn = document.getElementById('create-btn');
        this.leaveBtn = document.getElementById('leave-btn');
        this.toggleVideoBtn = document.getElementById('toggle-video');
        this.toggleAudioBtn = document.getElementById('toggle-audio');
        this.localVideo = document.getElementById('local-video');
        this.remoteVideos = document.getElementById('remote-videos');
        this.joinSection = document.getElementById('join-section');
        this.videoSection = document.getElementById('video-section');
        this.status = document.getElementById('status');
        this.roomInfo = document.getElementById('room-info');
        this.notifications = document.getElementById('notifications');
    }
    
    setupEventListeners() {
        this.joinBtn.addEventListener('click', () => this.joinRoom());
        this.createBtn.addEventListener('click', () => this.createRoom());
        this.leaveBtn.addEventListener('click', () => this.leaveRoom());
        this.toggleVideoBtn.addEventListener('click', () => this.toggleVideo());
        this.toggleAudioBtn.addEventListener('click', () => this.toggleAudio());
        
       
        this.roomIdInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.joinRoom();
        });
    }
    
    setupSocketEvents() {
        this.socket.on('users-in-room', (users) => {
            console.log('Users in room:', users);
            
            users.forEach(userId => {
                this.createPeerConnection(userId, true); 
            });
        });
        
        this.socket.on('user-joined', (userId) => {
            console.log('User joined:', userId);
            this.showNotification(`User ${userId.substring(0, 8)} joined the room`, 'info');
            this.createPeerConnection(userId, false); 
        });
        
        this.socket.on('user-left', (userId) => {
            console.log('User left:', userId);
            this.showNotification(`User ${userId.substring(0, 8)} left the room`, 'warning');
            this.removePeerConnection(userId);
        });
        
        this.socket.on('offer', async (data) => {
            console.log('Received offer from:', data.sender);
            await this.handleOffer(data.offer, data.sender);
        });
        
        this.socket.on('answer', async (data) => {
            console.log('Received answer from:', data.sender);
            await this.handleAnswer(data.answer, data.sender);
        });
        
        this.socket.on('ice-candidate', async (data) => {
            console.log('Received ICE candidate from:', data.sender);
            await this.handleIceCandidate(data.candidate, data.sender);
        });
    }
    
    async createRoom() {
        const roomId = 'room_' + Math.random().toString(36).substring(2, 8);
        this.roomIdInput.value = roomId;
        await this.joinRoom();
    }
    
    async joinRoom() {
        const roomId = this.roomIdInput.value.trim();
        if (!roomId) {
            this.showStatus('Please enter a room ID', 'error');
            return;
        }
        
        try {
            this.showStatus('Accessing camera and microphone...', 'loading');
            this.joinBtn.disabled = true;
            this.createBtn.disabled = true;
            
           
            this.localStream = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 1280 }, height: { ideal: 720 } },
                audio: true
            });
            
            this.localVideo.srcObject = this.localStream;
            
            
            this.socket.emit('join-room', roomId);
            this.currentRoom = roomId;
            
            // Switch to video section
            this.joinSection.classList.add('hidden');
            this.videoSection.classList.remove('hidden');
            
            this.roomInfo.textContent = `Room: ${roomId}`;
            this.showStatus('Connected successfully!', 'success');
            this.showNotification('Successfully joined the room!', 'success');
            
        } catch (error) {
            console.error('Error joining room:', error);
            this.showStatus('Failed to access camera/microphone', 'error');
            this.joinBtn.disabled = false;
            this.createBtn.disabled = false;
        }
    }
    
    async createPeerConnection(userId, shouldCreateOffer) {
        console.log(`Creating peer connection with ${userId}, shouldCreateOffer: ${shouldCreateOffer}`);
        
        const peerConnection = new RTCPeerConnection(this.rtcConfig);
        this.peerConnections.set(userId, peerConnection);
        
        
        this.localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, this.localStream);
        });
        
        // Handle remote stream
        peerConnection.ontrack = (event) => {
            console.log('Received remote stream from:', userId);
            const remoteStream = event.streams[0];
            this.addRemoteVideo(userId, remoteStream);
        };
        
        // Handle ICE candidates
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                console.log('Sending ICE candidate to:', userId);
                this.socket.emit('ice-candidate', {
                    candidate: event.candidate,
                    target: userId
                });
            }
        };
        
        // Handle connection state changes
        peerConnection.onconnectionstatechange = () => {
            console.log(`Connection state with ${userId}:`, peerConnection.connectionState);
        };
        
        // Create and send offer if we should initiate
        if (shouldCreateOffer) {
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            
            console.log('Sending offer to:', userId);
            this.socket.emit('offer', {
                offer: offer,
                target: userId
            });
        }
    }
    
    async handleOffer(offer, senderId) {
        const peerConnection = this.peerConnections.get(senderId);
        if (!peerConnection) {
            console.error('No peer connection found for:', senderId);
            return;
        }
        
        await peerConnection.setRemoteDescription(offer);
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        
        console.log('Sending answer to:', senderId);
        this.socket.emit('answer', {
            answer: answer,
            target: senderId
        });
    }
    
    async handleAnswer(answer, senderId) {
        const peerConnection = this.peerConnections.get(senderId);
        if (peerConnection) {
            await peerConnection.setRemoteDescription(answer);
        }
    }
    
    async handleIceCandidate(candidate, senderId) {
        const peerConnection = this.peerConnections.get(senderId);
        if (peerConnection) {
            await peerConnection.addIceCandidate(candidate);
        }
    }
    
    addRemoteVideo(userId, stream) {
        
        const existingVideo = document.getElementById(`remote-${userId}`);
        if (existingVideo) {
            existingVideo.remove();
        }
        
        const videoWrapper = document.createElement('div');
        videoWrapper.className = 'video-wrapper';
        videoWrapper.id = `remote-${userId}`;
        
        const video = document.createElement('video');
        video.autoplay = true;
        video.playsInline = true;
        video.srcObject = stream;
        
        const label = document.createElement('div');
        label.className = 'video-label';
        label.textContent = `User ${userId.substring(0, 8)}`;
        
        videoWrapper.appendChild(video);
        videoWrapper.appendChild(label);
        this.remoteVideos.appendChild(videoWrapper);
    }
    
    removePeerConnection(userId) {
        const peerConnection = this.peerConnections.get(userId);
        if (peerConnection) {
            peerConnection.close();
            this.peerConnections.delete(userId);
        }
        
        const remoteVideo = document.getElementById(`remote-${userId}`);
        if (remoteVideo) {
            remoteVideo.remove();
        }
    }
    
    toggleVideo() {
        this.isVideoEnabled = !this.isVideoEnabled;
        const videoTrack = this.localStream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.enabled = this.isVideoEnabled;
        }

        const icon = this.toggleVideoBtn.querySelector('i');
        icon.className = this.isVideoEnabled ? 'fas fa-video' : 'fas fa-video-slash';

        this.toggleVideoBtn.classList.toggle('muted', !this.isVideoEnabled);
        this.showStatusMessage(this.isVideoEnabled ? 'Video On' : 'Video Off');
    }

    toggleAudio() {
        this.isAudioEnabled = !this.isAudioEnabled;
        const audioTrack = this.localStream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = this.isAudioEnabled;
        }

        const icon = this.toggleAudioBtn.querySelector('i');
        icon.className = this.isAudioEnabled ? 'fas fa-microphone' : 'fas fa-microphone-slash';

        this.toggleAudioBtn.classList.toggle('muted', !this.isAudioEnabled);
        this.showStatusMessage(this.isAudioEnabled ? 'Audio Unmuted' : 'Audio Muted');
    }

    showStatusMessage(message) {
        const status = document.getElementById('statusPlaceholder');
        status.textContent = message;
        status.style.display = 'block';

        clearTimeout(this.statusTimeout);
        this.statusTimeout = setTimeout(() => {
            status.style.display = 'none';
        }, 2000);
    }

    
    leaveRoom() {
        // Close all peer connections
        this.peerConnections.forEach((pc, userId) => {
            pc.close();
        });
        this.peerConnections.clear();
        
       
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }
        
        
        if (this.currentRoom) {
            this.socket.emit('leave-room', this.currentRoom);
        }
        
        
        this.remoteVideos.innerHTML = '';
        this.videoSection.classList.add('hidden');
        this.joinSection.classList.remove('hidden');
        this.roomIdInput.value = '';
        this.joinBtn.disabled = false;
        this.createBtn.disabled = false;
        this.status.textContent = '';
        this.status.className = 'status';
        
        this.currentRoom = null;
        this.showNotification('Left the room', 'info');
    }
    
    showStatus(message, type) {
        this.status.textContent = message;
        this.status.className = `status ${type}`;
    }
    
    showNotification(message, type = 'success') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        this.notifications.appendChild(notification);
        
        
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }
}

//DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new WebRTCClient();
});