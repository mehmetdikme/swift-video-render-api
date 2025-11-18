import express from "express";
import cors from "cors";
import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import axios from "axios";
import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ extended: true, limit: "100mb" }));

// Statik dosyalar için klasör
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
app.use('/uploads', express.static(uploadsDir));

// Ana endpoint: video, ses ve altyazıyı birleştir
app.post("/render", async (req, res) => {
  try {
    const { video_url, audio_url, audio_base64, subtitles } = req.body;

    // Validasyon
    if (!video_url) {
      return res.status(400).json({ error: "Missing video_url" });
    }
    if (!audio_url && !audio_base64) {
      return res.status(400).json({ error: "Missing audio_url or audio_base64" });
    }

    // Unique ID oluştur
    const jobId = Date.now();
    const videoPath = `video_${jobId}.mp4`;
    const audioPath = `audio_${jobId}.mp3`;
    const subtitlePath = `subtitles_${jobId}.srt`;
    const outputPath = `final_${jobId}.mp4`;

    // Video'yu indir
    const downloadFile = async (url, filePath) => {
      const response = await axios({ url, responseType: "arraybuffer" });
      fs.writeFileSync(filePath, Buffer.from(response.data));
    };

    console.log("📥 Downloading video...");
    await downloadFile(video_url, videoPath);

    // Audio'yu hazırla
    if (audio_base64) {
      console.log("🎵 Processing base64 audio...");
      const base64Data = audio_base64.replace(/^data:audio\/\w+;base64,/, "");
      const buffer = Buffer.from(base64Data, 'base64');
      fs.writeFileSync(audioPath, buffer);
    } else if (audio_url) {
      console.log("🎵 Downloading audio...");
      await downloadFile(audio_url, audioPath);
    }

    // Altyazıyı kaydet
    if (subtitles) {
      console.log("📝 Writing subtitles...");
      fs.writeFileSync(subtitlePath, subtitles);
    }

    console.log("🎬 Starting FFmpeg...");

    // FFmpeg ile birleştir
    const command = ffmpeg()
      .input(videoPath)
      .inputOptions(["-stream_loop -1"])
      .input(audioPath)
      .videoCodec("libx264")
      .audioCodec("aac")
      .outputOptions(["-preset ultrafast", "-shortest"])
      .output(outputPath);

    // Altyazı ekle
    if (subtitles) {
      command.outputOptions([
        `-vf subtitles=${subtitlePath}:force_style='FontSize=24,PrimaryColour=&HFFFFFF&,OutlineColour=&H000000&,Outline=2'`
      ]);
    }

    command.on("start", (cmd) => {
      console.log("🔧 FFmpeg command:", cmd);
    });

    command.on("end", () => {
      console.log("✅ Video rendered successfully!");
      
      // Dosyayı gönder
      res.sendFile(path.resolve(outputPath), (err) => {
        // Temizlik
        [videoPath, audioPath, subtitlePath, outputPath].forEach(file => {
          if (fs.existsSync(file)) fs.unlinkSync(file);
        });
      });
    });

    command.on("error", (err) => {
      console.error("❌ FFmpeg error:", err);
      res.status(500).json({ error: err.message });
      
      // Hata durumunda temizlik
      [videoPath, audioPath, subtitlePath, outputPath].forEach(file => {
        if (fs.existsSync(file)) fs.unlinkSync(file);
      });
    });

    command.run();

  } catch (err) {
    console.error("❌ Error rendering video:", err);
    res.status(500).json({ error: err.message });
  }
});

// Test endpoint
app.get("/", (req, res) => {
  res.send("🎥 Swift Video Render API is running!");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
