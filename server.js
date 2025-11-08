import express from "express";
import cors from "cors";
import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import axios from "axios";

const app = express();
app.use(cors());
app.use(express.json({ limit: "100mb" }));

// Ana endpoint: video, ses ve altyazıyı birleştir
app.post("/render", async (req, res) => {
  try {
    const { videoUrl, audioUrl, subtitleText } = req.body;

    if (!videoUrl || !audioUrl) {
      return res.status(400).json({ error: "Missing video or audio URL" });
    }

    // Dosyaları indir
    const downloadFile = async (url, path) => {
      const response = await axios({ url, responseType: "arraybuffer" });
      fs.writeFileSync(path, Buffer.from(response.data));
    };

    await downloadFile(videoUrl, "video.mp4");
    await downloadFile(audioUrl, "audio.mp3");

    // Altyazıyı dosyaya kaydet (isteğe bağlı)
    if (subtitleText) fs.writeFileSync("subtitles.srt", subtitleText);

    const output = "final_output.mp4";

    // FFmpeg ile birleştir
    const command = ffmpeg("video.mp4")
      .addInput("audio.mp3")
      .videoCodec("libx264")
      .audioCodec("aac")
      .outputOptions(["-shortest"])
      .output(output);

    if (subtitleText) command.input("subtitles.srt").outputOptions("-c:s mov_text");

    command.on("end", () => {
      const file = fs.readFileSync(output);
      res.setHeader("Content-Type", "video/mp4");
      res.send(file);
    });

    command.on("error", (err) => {
      console.error("FFmpeg error:", err);
      res.status(500).json({ error: err.message });
    });

    command.run();
  } catch (err) {
    console.error("Error rendering video:", err);
    res.status(500).json({ error: err.message });
  }
});

// Render test endpoint
app.get("/", (req, res) => {
  res.send("🎥 Swift Video Render API is running!");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
