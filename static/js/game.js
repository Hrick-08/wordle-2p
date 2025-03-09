document.addEventListener("DOMContentLoaded", () => {
  const socket = io()
  const roomId = document.getElementById("room-id").textContent
  const playerName = document.getElementById("player-name").textContent

  let currentGuess = ""
  let guessRow = 0
  let gameActive = false

  // DOM elements
  const playerBoard = document.getElementById("player-board")
  const opponentBoard = document.getElementById("opponent-board")
  const statusMessage = document.getElementById("status-message")
  const playersList = document.getElementById("players-list")
  const gameOverModal = document.getElementById("game-over")
  const gameResult = document.getElementById("game-result")
  const gameMessage = document.getElementById("game-message")
  const targetWordElement = document.getElementById("target-word")
  const newGameBtn = document.getElementById("new-game-btn")
  const copyBtn = document.getElementById("copy-btn")
  const themeToggle = document.getElementById("theme-toggle")
  const body = document.body

  // Create invalid word warning element
  const invalidWordWarning = document.createElement("div")
  invalidWordWarning.className = "invalid-word-warning"
  invalidWordWarning.textContent = "Not in word list"
  document.body.appendChild(invalidWordWarning)

  // Initialize boards
  function initializeBoards() {
    // Create 6 rows for each board
    for (let i = 0; i < 6; i++) {
      const playerRow = document.createElement("div")
      playerRow.className = "row"

      const opponentRow = document.createElement("div")
      opponentRow.className = "row"

      // Create 5 tiles for each row
      for (let j = 0; j < 5; j++) {
        const playerTile = document.createElement("div")
        playerTile.className = "tile"
        playerRow.appendChild(playerTile)

        const opponentTile = document.createElement("div")
        opponentTile.className = "tile"
        opponentRow.appendChild(opponentTile)
      }

      playerBoard.appendChild(playerRow)
      opponentBoard.appendChild(opponentRow)
    }
  }

  // Update the current guess on the board
  function updateCurrentGuess() {
    const row = playerBoard.querySelectorAll(".row")[guessRow]
    const tiles = row.querySelectorAll(".tile")

    // Clear the row
    for (let i = 0; i < 5; i++) {
      tiles[i].textContent = ""
      tiles[i].className = "tile"
    }

    // Fill in the current guess
    for (let i = 0; i < currentGuess.length; i++) {
      tiles[i].textContent = currentGuess[i]
      tiles[i].className = "tile active"
    }
  }

  // Handle keyboard input
  function handleKeyInput(key) {
    if (!gameActive) return

    if (key === "ENTER") {
      if (currentGuess.length === 5) {
        submitGuess()
      } else {
        showInvalidWordWarning("Word too short")
      }
    } else if (key === "BACKSPACE") {
      currentGuess = currentGuess.slice(0, -1)
      updateCurrentGuess()
    } else if (/^[A-Z]$/.test(key) && currentGuess.length < 5) {
      currentGuess += key
      updateCurrentGuess()
    }
  }

  // Submit a guess
  function submitGuess() {
    socket.emit("guess", {
      room: roomId,
      guess: currentGuess,
    })
  }

  // Show invalid word warning
  function showInvalidWordWarning(message) {
    invalidWordWarning.textContent = message || "Not in word list"
    invalidWordWarning.classList.add("show")

    // Show invalid animation on tiles
    const row = playerBoard.querySelectorAll(".row")[guessRow]
    const tiles = row.querySelectorAll(".tile")

    tiles.forEach((tile) => {
      tile.classList.add("invalid")
    })

    // Remove the warning and animation after a delay
    setTimeout(() => {
      invalidWordWarning.classList.remove("show")
      tiles.forEach((tile) => {
        tile.classList.remove("invalid")
      })
    }, 1500)
  }

  // Update the keyboard based on guess results
  function updateKeyboard(guess, result) {
    const keys = document.querySelectorAll(".key")

    for (let i = 0; i < guess.length; i++) {
      const letter = guess[i]
      const status = result[i]

      keys.forEach((key) => {
        if (key.dataset.key === letter) {
          // Only update if the current status is better than the previous
          if (status === "correct") {
            key.className = "key correct"
          } else if (status === "present" && key.className !== "key correct") {
            key.className = "key present"
          } else if (status === "absent" && key.className !== "key correct" && key.className !== "key present") {
            key.className = "key absent"
          }
        }
      })
    }
  }

  // Display guess result on the board
  function displayGuessResult(guess, result, isPlayer) {
    const board = isPlayer ? playerBoard : opponentBoard
    const rowIndex = isPlayer ? guessRow : document.querySelectorAll(`#${board.id} .row-filled`).length
    const row = board.querySelectorAll(".row")[rowIndex]

    if (!row) return

    row.className = "row row-filled"
    const tiles = row.querySelectorAll(".tile")

    for (let i = 0; i < guess.length; i++) {
      const tile = tiles[i]
      tile.textContent = guess[i]

      // Only add result classes for player's own guesses
      if (isPlayer && result) {
        tile.className = `tile ${result[i]}`
      } else {
        tile.className = "tile filled"
      }
    }

    if (isPlayer) {
      guessRow++
      currentGuess = ""
    }
  }

  // Toggle dark mode
  function toggleDarkMode() {
    body.classList.toggle("dark")
    const isDarkMode = body.classList.contains("dark")
    localStorage.setItem("darkMode", isDarkMode)
  }

  // Initialize dark mode from localStorage
  function initDarkMode() {
    const isDarkMode = localStorage.getItem("darkMode") === "true"
    if (isDarkMode) {
      body.classList.add("dark")
      themeToggle.checked = true
    }
  }

  // Socket events
  socket.on("connect", () => {
    console.log("Connected to server. Player name:", playerName)
    socket.emit("join", {
      name: playerName,
      room: roomId,
    })
  })

  socket.on("status", (data) => {
    console.log("Status update:", data)
    statusMessage.textContent = data.message

    // Update players list
    if (data.players && data.players.length > 0) {
      playersList.innerHTML = "<strong>Players:</strong> " + data.players.join(", ")
    }
  })

  socket.on("game_start", (data) => {
    console.log("Game starting:", data)
    statusMessage.textContent = data.message

    // Update players list
    if (data.players && data.players.length > 0) {
      playersList.innerHTML = "<strong>Players:</strong> " + data.players.join(", ")
    }

    gameActive = true
    statusMessage.textContent = "Game started! Guess the word!"
  })

  socket.on("invalid_guess", (data) => {
    showInvalidWordWarning(data.message)
  })

  socket.on("guess_result", (data) => {
    displayGuessResult(data.guess, data.result, true)
    updateKeyboard(data.guess, data.result)
  })

  socket.on("opponent_guess", (data) => {
    // Show who made the guess
    statusMessage.textContent = `${data.name} guessed: ${data.guess}`
    displayGuessResult(data.guess, null, false)

    // Reset status message after a short delay
    setTimeout(() => {
      statusMessage.textContent = "Game in progress"
    }, 2000)
  })

  socket.on("game_over", (data) => {
    gameActive = false
    targetWordElement.textContent = data.target_word

    if (data.winner === playerName) {
      gameResult.textContent = "You Win!"
      gameMessage.textContent = "Congratulations! You guessed the word first."
    } else {
      gameResult.textContent = "You Lose!"
      gameMessage.textContent = `${data.winner} guessed the word first.`
    }

    gameOverModal.classList.remove("hidden")
  })

  // Event listeners
  document.querySelectorAll(".key").forEach((key) => {
    key.addEventListener("click", () => {
      handleKeyInput(key.dataset.key)
    })
  })

  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      handleKeyInput("ENTER")
    } else if (e.key === "Backspace") {
      handleKeyInput("BACKSPACE")
    } else if (/^[a-zA-Z]$/.test(e.key)) {
      handleKeyInput(e.key.toUpperCase())
    }
  })

  newGameBtn.addEventListener("click", () => {
    window.location.href = "/"
  })

  copyBtn.addEventListener("click", () => {
    navigator.clipboard.writeText(roomId)
    copyBtn.textContent = "Copied!"
    setTimeout(() => {
      copyBtn.textContent = "Copy"
    }, 2000)
  })

  // Dark mode toggle event listener
  if (themeToggle) {
    themeToggle.addEventListener("change", toggleDarkMode)
  }

  // Initialize the game
  initializeBoards()
  initDarkMode()
  console.log("Game initialized for player:", playerName, "in room:", roomId)
})