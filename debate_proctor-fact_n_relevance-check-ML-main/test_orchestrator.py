# test_orchestrator.py
from search_engine.core import orchestrate_analysis

print("🚀 Running Orchestrator Test in Isolation...")

# Fake a debater statement
mock_statement = "According to the International Energy Agency (IEA), a 100-megawatt data center can consume up to 2 million liters of water per day."

# Fire the orchestrator directly
analysis_result = orchestrate_analysis(
    text=mock_statement,
    previous_text=None,
    topic="ai",
    debater_name="TestDebater"
)

print("\n🎉 Test Complete!")