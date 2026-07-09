from search_engine.core import orchestrate_analysis

prev = "AI data centers are a major driver of freshwater depletion in already water-stressed regions."
mock_statement = "That is true, but agriculture accounts for roughly 70% of global freshwater withdrawals, making AI's share comparatively small."

result = orchestrate_analysis(
    text=mock_statement,
    previous_text=prev,
    topic="ai",
    debater_name="TestDebater"
)