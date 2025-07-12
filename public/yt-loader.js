// Copyright (C) 2025 Jayden Ha
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.

const ytUrlInput = document.getElementById('yt-url');
const fetchButton = document.getElementById('fetch-button');
const downloadButton = document.getElementById('download-button');
const videoPlayer = document.getElementById('video-player');
const videoProgress = document.getElementById('video-progress');
const audioProgress = document.getElementById('audio-progress');

let mergedVideoBlob = null;

const fetchWithProgress = async (url, progressEl) => {
    const response = await fetch(url);
    const reader = response.body.getReader();
    const contentLength = +response.headers.get('Content-Length');
    let receivedLength = 0;
    let chunks = [];
    while(true) {
        const {done, value} = await reader.read();
        if (done) {
            break;
        }
        chunks.push(value);
        receivedLength += value.length;
        const percentage = Math.round((receivedLength / contentLength) * 100);
        progressEl.style.width = `${percentage}%`;
        progressEl.textContent = `${percentage}%`;
    }
    let chunksAll = new Uint8Array(receivedLength);
    let position = 0;
    for(let chunk of chunks) {
        chunksAll.set(chunk, position);
        position += chunk.length;
    }
    return chunksAll;
}

fetchButton.addEventListener('click', async () => {
    const ytUrl = ytUrlInput.value;

    if (ytUrl) {
        fetchButton.classList.add('loading');
        fetchButton.disabled = true;
        videoProgress.style.width = '0%';
        videoProgress.textContent = '0%';
        audioProgress.style.width = '0%';
        audioProgress.textContent = '0%';
        downloadButton.classList.add('hidden');

        try {
            const response = await fetch('/get-media', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ url: ytUrl })
            });
            const media = await response.json();
            const videoUrl = media.video;
            const audioUrl = media.audio;

            const proxiedVideoUrl = `/proxy/${encodeURIComponent(videoUrl)}`;
            const proxiedAudioUrl = `/proxy/${encodeURIComponent(audioUrl)}`;
            const mergedVideo = await mergeVideo(proxiedVideoUrl, proxiedAudioUrl);
            mergedVideoBlob = new Blob([mergedVideo], { type: 'video/mp4' });
            const url = URL.createObjectURL(mergedVideoBlob);
            videoPlayer.src = url;
            new Plyr(videoPlayer);
            downloadButton.classList.remove('hidden');
        } catch (error) {
            alert('An error occurred during the process.');
            console.error(error);
        } finally {
            fetchButton.classList.remove('loading');
            fetchButton.disabled = false;
        }
    } else {
        alert('Please enter a YouTube URL.');
    }
});

downloadButton.addEventListener('click', () => {
    if (mergedVideoBlob) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(mergedVideoBlob);
        a.download = 'video.mp4';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }
});

async function mergeVideo(video, audio) {
    let { createFFmpeg } = FFmpeg;
    let ffmpeg = createFFmpeg();
    await ffmpeg.load();
    const [videoData, audioData] = await Promise.all([
        fetchWithProgress(video, videoProgress),
        fetchWithProgress(audio, audioProgress)
    ]);
    ffmpeg.FS('writeFile', 'video.mp4', videoData);
    ffmpeg.FS('writeFile', 'audio.mp4', audioData);
    await ffmpeg.run('-i', 'video.mp4', '-i', 'audio.mp4', '-c', 'copy', 'output.mp4');
    let data = await ffmpeg.FS('readFile', 'output.mp4');
    return new Uint8Array(data.buffer);
};
