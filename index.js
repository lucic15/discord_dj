const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  getVoiceConnection,
} = require("@discordjs/voice");
const play = require("play-dl");
const sodium = require("libsodium-wrappers");
const { default: axios } = require("axios");
require("dotenv").config();

//Define Global Variables
let connection;
let audioPlayer;
let shuffleMode = false;
let videos;

// Define available commands with their descriptions
const commands = [
  {
    name: "!help",
    description: "Displays all commands!",
  },
  {
    name: "!play",
    description: "Plays the given playlist or video!",
  },
  {
    name: "!p",
    description: "Plays a predefined playlist!",
  },

  {
    name: "!pause",
    description: "Pauses the music for a specified time!",
  },
  {
    name: "!unpause",
    description: "Resumes the paused music!",
  },
  {
    name: "!next",
    description: "Skips the current song!",
  },
  {
    name: "!stop",
    description: "Stops the music!",
  },
  {
    name: "!shuffle",
    description: "Toggles shuffle mode!",
  },
  {
    name: "!list",
    description: "List saved playlists! ",
  },
];

//Commands

// Function to display help
function help(message) {
  const helpEmbed = new EmbedBuilder()
    .setColor(0x0099ff)
    .setTitle("Help Menu")
    .setAuthor({
      name: "Music Bot",
      iconURL:
        "https://raw.githubusercontent.com/codetheweb/aoede/main/.github/logo.png",
    })
    .addFields(
      commands.map((cmd) => ({
        name: cmd.name,
        value: cmd.description,
        inline: false,
      }))
    )
    .setTimestamp()
    .setFooter({
      text: "Some footer text here",
    });

  message.channel.send({ embeds: [helpEmbed] });
}

// Function to play a playlist
async function playPlaylist(playlistUrl, message) {
  await sodium.ready;

  // Get the voice channel of the user
  let voiceChannel = message.member.voice.channel;
  if (!voiceChannel) {
    return message.reply("You need to be in a voice channel to play music!");
  }

  // Join the voice channel
  connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: message.guild.id,
    adapterCreator: message.guild.voiceAdapterCreator,
  });

  try {
    if (!playlistUrl.includes("watch") && !playlistUrl.includes("playlist")) {
      fetchSaved(playlistUrl, message);
      return;
    }
    if (!playlistUrl.includes("playlist")) {
      audioPlayer = createAudioPlayer();
      let stream = await play.stream(playlistUrl);
      const resource = createAudioResource(stream.stream, {
        inputType: stream.type,
      });
      audioPlayer.play(resource);
      connection.subscribe(audioPlayer);

      // Get video data
      const videoInfo = await play.video_basic_info(playlistUrl);
      const video = videoInfo.video_details;

      // Create embed message
      const musicEmbed = new EmbedBuilder()
        .setColor(0x0099ff)
        .setTitle(`Now Playing: **${video.title}**`)
        .setAuthor({
          name: "Music Bot",
          iconURL:
            "https://raw.githubusercontent.com/codetheweb/aoede/main/.github/logo.png",
        })
        .setDescription(`00:00 / ${video.durationRaw}`)
        .setImage(`${video.thumbnails[3].url}`)
        .setTimestamp()
        .setFooter({
          text: "Some footer text here",
        });

      //Send embed message
      const nowPlayingMessage = await message.channel.send({
        embeds: [musicEmbed],
      });

      // Update playback time
      const interval = setInterval(() => {
        const updatedEmbed = EmbedBuilder.from(musicEmbed).setDescription(
          `${formatTime(audioPlayer.state.playbackDuration)} / ${
            video.durationRaw
          }`
        );
        nowPlayingMessage.edit({ embeds: [updatedEmbed] });
      }, 1000);

      // Stop playing when audio becomes idle
      audioPlayer.once("idle", () => {
        clearInterval(interval);
        stopPlaying();
      });

      return;
    }

    // Play all videos in the playlist
    let playlist = await play.playlist_info(playlistUrl, { incomplete: true });
    audioPlayer = createAudioPlayer();
    videos = playlist.videos;
    if (shuffleMode) {
      videos = shuffleArray(videos);
    }

    let currentVideoIndex = 0;

    const playNextVideo = async () => {
      if (currentVideoIndex >= videos.length) {
        // Stop playing at end of playlist
        stopPlaying();
        return;
      }

      const video = videos[currentVideoIndex];
      currentVideoIndex++;

      let stream = await play.stream(video.url);
      const resource = createAudioResource(stream.stream, {
        inputType: stream.type,
      });

      // Play the next video
      audioPlayer.play(resource);

      const musicEmbed = new EmbedBuilder()
        .setColor(0x0099ff)
        .setTitle(`Now Playing: **${video.title}**`)
        .setAuthor({
          name: "Music Bot",
          iconURL:
            "https://raw.githubusercontent.com/codetheweb/aoede/main/.github/logo.png",
        })
        .setDescription(`00:00 / ${video.durationRaw}`)
        .setImage(`${video.thumbnails[3].url}`)
        .setTimestamp()
        .setFooter({
          text: `Requester:${message.author.globalName}`, // make sure that author is tagged
        });

      const nowPlayingMessage = await message.channel.send({
        embeds: [musicEmbed],
      });

      connection.subscribe(audioPlayer);

      const interval = setInterval(() => {
        const updatedEmbed = EmbedBuilder.from(musicEmbed).setDescription(
          `${formatTime(audioPlayer.state.playbackDuration)} / ${
            video.durationRaw
          }`
        );
        nowPlayingMessage.edit({ embeds: [updatedEmbed] });
      }, 1000);

      // Play the next video when the current one ends
      audioPlayer.once("idle", () => {
        clearInterval(interval);
        playNextVideo();
      });
    };

    playNextVideo();
  } catch (error) {
    console.error(error);
    message.reply("There was an error trying to play the playlist or video!");
  }
}

//Function to pause music
async function pause(timeout) {
  if (audioPlayer) {
    audioPlayer.pause();
    if (timeout) {
      setTimeout(() => unpause(), timeout * 1000);
    }
  }
}

//Fetch song from db (json-server)
function fetchSaved(id, message) {
  axios
    .get(`http://localhost:3000/urls/${id}`)
    .then((response) => {
      const post = response.data;
      playPlaylist(post.url, message);
    })
    .catch((error) => console.error("Error fetching data:", error));
}

// Function to unpause music
async function unpause() {
  if (audioPlayer) {
    audioPlayer.unpause();
  }
}

// Function to play the next video
async function next() {
  if (connection && audioPlayer) {
    if (shuffleMode) {
      videos = shuffleArray(videos);
    }
    audioPlayer.stop();
  }
}

//Function to stop playing
async function stopPlaying() {
  if (connection && audioPlayer) {
    connection.disconnect();
    audioPlayer.stop();
  }
}

// Function to shuffle an array
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// Function to toggle shuffle mode
function toggleShuffle(message) {
  shuffleMode = !shuffleMode;
  message.reply(`Shuffle mode is now ${shuffleMode ? "enabled" : "disabled"}`);
}
//List saved playlists
function listSavedPlaylist(message) {
  axios
    .get("http://localhost:3000/urls/")
    .then((response) => {
      const posts = response.data;
      const helpEmbed = new EmbedBuilder()
        .setColor(0x0099ff)
        .setTitle("Help Menu")
        .setAuthor({
          name: "Music Bot",
          iconURL:
            "https://raw.githubusercontent.com/codetheweb/aoede/main/.github/logo.png",
        })
        .addFields(
          posts.map((post) => ({
            name: post.id,
            value: post.title,
            inline: false,
          }))
        )
        .setTimestamp()
        .setFooter({
          text: "Some footer text here",
        });

      message.channel.send({ embeds: [helpEmbed] });
    })
    .catch((error) => console.error("Error fetching data:", error));
}

//Other Functions

// Function to format time (milliseconds to min:sec)
function formatTime(milliseconds) {
  var seconds = Math.floor(milliseconds / 1000);
  var minutes = Math.floor(seconds / 60);
  seconds = seconds % 60;
  return ("0" + minutes).slice(-2) + ":" + ("0" + seconds).slice(-2);
}

// Function to run commands
async function processCommand(command, args, message) {
  switch (command) {
    case "!help":
      help(message);
      break;
    case "!play":
      if (args.length < 2) {
        return message.reply("You need to provide a YouTube URL!");
      }
      const playlistUrl = args[1];
      await playPlaylist(playlistUrl, message);
      break;
    case "!list":
      listSavedPlaylist(message);
      break;
    case "!p":
      await playPlaylist(process.env.defined_url, message);
      break;
    case "!pause":
      pause(args[1]);
      break;
    case "!unpause":
      unpause();
      break;
    case "!stop":
      stopPlaying();
      break;
    case "!next":
      next();
      break;
    case "!shuffle":
      toggleShuffle(message);
      break;
    default:
      break;
  }
}

//Start bot
(async () => {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  const TOKEN = process.env.TOKEN;

  client.once("ready", () => {
    console.log(`Logged in as ${client.user.tag}!`);
  });

  client.on("messageCreate", async (message) => {
    const args = message.content.split(" ");
    const command = args[0];

    await processCommand(command, args, message);
  });

  client.login(TOKEN);
})();
