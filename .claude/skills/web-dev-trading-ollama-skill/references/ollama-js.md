# Ollama JS Integration

## Chat Endpoint
```javascript
const response = await fetch('http://localhost:11434/api/chat', {
  method: 'POST',
  body: JSON.stringify({
    model: 'llama3.1:8b',
    messages: [{role: 'user', content: prompt}],
    stream: true
  })
});
```

## Streaming Parser
Use TextDecoder on response.body for real-time typing effect.