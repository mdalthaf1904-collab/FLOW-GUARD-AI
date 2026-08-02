/**
 * FlowGuard AI - AI Controller
 * Manages Azure OpenAI LLM requests for traffic timing recommendations & rationale.
 */

exports.getRecommendation = async (req, res) => {
  try {
    const { beforeMetrics, afterMetrics, recommendedSplit } = req.body;

    const apiKey = process.env.AZURE_OPENAI_KEY;
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    const deploymentName = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4';

    const beforeDelay = beforeMetrics ? beforeMetrics.avg_delay_sec || 0 : 0;
    const afterDelay = afterMetrics ? afterMetrics.avg_delay_sec || 0 : 0;
    const beforeQueue = beforeMetrics ? beforeMetrics.max_queue_length || 0 : 0;
    const afterQueue = afterMetrics ? afterMetrics.max_queue_length || 0 : 0;
    const splitDesc = recommendedSplit || 'Adjusted Green Split';

    // If Azure OpenAI key is placeholder or missing, return intelligent fallback
    if (!apiKey || apiKey === 'your_azure_openai_key_here' || !endpoint || endpoint.includes('your-resource-name')) {
      const delaySaved = (beforeDelay - afterDelay).toFixed(1);
      const queueSaved = (beforeQueue - afterQueue).toFixed(0);
      
      return res.json({
        success: true,
        source: 'fallback',
        rationale: `Reallocating green time to peak approaches (${splitDesc}) reduces estimated queue delay by ${delaySaved > 0 ? delaySaved : 0.0}s/veh and maximum queue length by ${queueSaved > 0 ? queueSaved : 0} vehicles under D/D/1 simulation modeling.`
      });
    }

    const prompt = `
      You are an AI traffic engineer assistant for FlowGuard AI.
      We are proposing a signal adjustment: "${splitDesc}".
      Before adjustment: Avg Delay = ${beforeDelay}s, Max Queue = ${beforeQueue} vehicles.
      After adjustment: Avg Delay = ${afterDelay}s, Max Queue = ${afterQueue} vehicles.
      Please provide a concise, 2-sentence civil engineering rationale explaining why this timing change relieves the bottleneck.
    `;

    const url = `${endpoint}/openai/deployments/${deploymentName}/chat/completions?api-version=2023-05-15`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 120,
        temperature: 0.2
      })
    });

    if (!response.ok) {
      throw new Error(`Azure API HTTP error ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const rationale = (data.choices && data.choices.length > 0)
      ? data.choices[0].message.content.trim()
      : 'No rationale returned by Azure OpenAI.';

    res.json({
      success: true,
      source: 'azure_openai',
      rationale
    });
  } catch (error) {
    console.error('Error in aiController:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      rationale: 'Unable to connect to Azure OpenAI service. Fallback: Green split rebalancing aligns cycle splits with peak volume demand.'
    });
  }
};
