from flask import Flask, render_template, request, session, redirect, url_for
from flask_socketio import SocketIO, join_room, leave_room, emit
import random
import os
import uuid

app = Flask(__name__)
app.config['SECRET_KEY'] = os.urandom(24)
socketio = SocketIO(app, cors_allowed_origins="*")

# Load word list

with open('word_list.txt', 'r') as f:
    WORDS = [word.strip().upper() for word in f.readlines()]
# except FileNotFoundError:
#     # Fallback to a small list of words if file not found
#     WORDS = ["APPLE", "BEACH", "CHAIR", "DANCE", "EAGLE", "FLAME", "GRAPE", "HOUSE", "IMAGE", "JUICE"]

# Game rooms
rooms = {}

@app.route('/', methods=['GET', 'POST'])
def index():
    if request.method == 'POST':
        name = request.form.get('name')
        create = request.form.get('create')
        join = request.form.get('join')
        room_id = request.form.get('room_id')
        
        if not name:
            return render_template('index.html', error="Please enter your name")
        
        session['name'] = name
        
        if create:
            room_id = str(uuid.uuid4())[:8]
            return redirect(url_for('game', room_id=room_id))
        
        if join and room_id:
            if room_id not in rooms:
                return render_template('index.html', error="Room does not exist", name=name)
            if len(rooms[room_id]['players']) >= 2:
                return render_template('index.html', error="Room is full", name=name)
            return redirect(url_for('game', room_id=room_id))
            
        return render_template('index.html', error="Please create or join a room", name=name)
        
    return render_template('index.html')

@app.route('/game/<room_id>')
def game(room_id):
    name = session.get('name')
    if not name:
        return redirect(url_for('index'))
    
    return render_template('game.html', room_id=room_id, name=name)

@socketio.on('join')
def on_join(data):
    name = data['name']
    room = data['room']
    
    join_room(room)
    
    if room not in rooms:
        # Create a new room
        target_word = random.choice(WORDS)
        rooms[room] = {
            'players': {},
            'target_word': target_word,
            'guesses': [],
            'game_over': False,
            'winner': None
        }
    
    # Add player to room
    rooms[room]['players'][request.sid] = {
        'name': name,
        'guesses': []
    }
    
    # Notify others that player joined
    emit('status', {
        'message': f'{name} has joined the room.',
        'players': [player['name'] for player in rooms[room]['players'].values()]
    }, to=room)
    
    # If we have 2 players, start the game
    if len(rooms[room]['players']) == 2:
        emit('game_start', {
            'message': f'Game is starting! Guess the 5-letter word.',
            'players': [player['name'] for player in rooms[room]['players'].values()]
        }, to=room)

@socketio.on('disconnect')
def on_disconnect():
    for room_id in list(rooms.keys()):
        if request.sid in rooms[room_id]['players']:
            name = rooms[room_id]['players'][request.sid]['name']
            leave_room(room_id)
            del rooms[room_id]['players'][request.sid]
            
            if len(rooms[room_id]['players']) == 0:
                del rooms[room_id]
            else:
                emit('status', {
                    'message': f'{name} has left the room.',
                    'players': [player['name'] for player in rooms[room_id]['players'].values()]
                }, to=room_id)
                
                # If the game was in progress, end it
                if not rooms[room_id]['game_over'] and len(rooms[room_id]['players']) < 2:
                    emit('game_interrupted', {
                        'message': f'{name} left the game. Waiting for another player to join.'
                    }, to=room_id)

@socketio.on('guess')
def on_guess(data):
    room = data['room']
    guess = data['guess'].upper()
    
    if room not in rooms or rooms[room]['game_over']:
        return
    
    # Get player name
    name = rooms[room]['players'][request.sid]['name']
    
    # Validate guess
    if len(guess) != 5:
        emit('invalid_guess', {'message': 'Word must be 5 letters'}, to=request.sid)
        return
        
    if guess not in WORDS:
        emit('invalid_guess', {'message': 'Not in word list'}, to=request.sid)
        return
    
    # Add guess to player's guesses
    rooms[room]['players'][request.sid]['guesses'].append(guess)
    
    # Check if guess is correct
    target_word = rooms[room]['target_word']
    is_correct = (guess == target_word)
    
    # Calculate result for the player who made the guess
    result = []
    for i, letter in enumerate(guess):
        if letter == target_word[i]:
            result.append('correct')
        elif letter in target_word:
            result.append('present')
        else:
            result.append('absent')
    
    # Send result to the player who made the guess
    emit('guess_result', {
        'guess': guess,
        'result': result,
        'is_correct': is_correct
    }, to=request.sid)
    
    # Send the guess to all other players
    for sid in rooms[room]['players']:
        if sid != request.sid:
            emit('opponent_guess', {
                'name': name,
                'guess': guess
            }, to=sid)
    
    # If guess is correct, end the game
    if is_correct:
        rooms[room]['game_over'] = True
        rooms[room]['winner'] = name
        
        emit('game_over', {
            'winner': name,
            'target_word': target_word
        }, to=room)

if __name__ == '__main__':
    socketio.run(app, debug=True)