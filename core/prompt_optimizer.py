# 核心骨架（保留原有 Key 结构，深度增强对真实光影、人体解剖、镜头物理的约束）
        base_json_struct = """{
  "subject": {
    "appearance": "flawless anatomical correctness, physically accurate human proportions, ultra-detailed skin texture, realistic pores, subtle natural micro-blemishes", 
    "body_type": "...", 
    "accessories": "..."
  },
  "clothing": {
    "top": "[specify real-world fabric textures, e.g., thick knit, worn denim, wrinkled cotton]", 
    "bottom": "...", 
    "shoes": "..."
  },
  "pose_and_action": {
    "pose": "[CRITICAL: EXACTLY ONE specific pose. NEVER use words like 'various', 'multiple', 'different angles'. Obey real-world gravity and physics]", 
    "action": "[ONE specific action]", 
    "gaze": "..."
  },
  "environment": {
    "scene": "...", 
    "furniture": "...", 
    "decor": "...", 
    "items": "..."
  },
  "lighting": {
    "type": "physically accurate lighting (e.g., volumetric sunlight, cinematic chiaroscuro, Rembrandt lighting)", 
    "source": "realistic light source direction with natural decay", 
    "quality": "realistic shadows, global illumination, bounce light"
  },
  "styling_and_mood": {
    "aesthetic": "...", 
    "mood": "..."
  },
  "technical_specs": {
    "camera_simulation": "specific real-world camera (e.g., ARRI Alexa 65, Hasselblad H6D, 35mm film)", 
    "focal_length": "exact millimeter (e.g., 85mm macro, 24mm wide)", 
    "aperture": "exact f-stop for realistic depth of field (e.g., f/1.4, f/8)", 
    "quality_tags": ["single frame", "solo", "ultra photorealistic", "8k resolution", "award-winning photography", "raw photo", "physically based rendering"]
  }
}"""

        if count == 1:
            sys_prompt = f"""You are an elite Cinematographer, Anatomist, and AI Prompt Engineer.
Output ONLY ONE valid JSON object based on the user's action.
CRITICAL RULES:
1. Output MUST be a valid JSON object.
2. ABSOLUTELY NO collages, grids, or multiple views. Describe exactly ONE single frozen moment.
3. HYPER-REALISM RULE: Ensure strict anatomical correctness, real-world physics (gravity/fabric folds), and physically accurate lighting (shadows, light bounce).
4. Do NOT use cartoonish or stylized descriptions unless explicitly requested by the user. Focus on real-world photographic precision.
{base_json_struct}"""
        else:
            sys_prompt = f"""You are an elite Cinematographer, Anatomist, and AI Prompt Engineer.
Generate EXACTLY {count} distinct variations of the user's action.
CRITICAL RULES:
1. Output MUST be a JSON object containing a "results" array: {{"results": [...]}}
2. The "results" array must contain exactly {count} objects.
3. ANTI-COLLAGE RULE: Each JSON object represents ONE SINGLE IMAGE. Pick exactly ONE specific pose and ONE camera angle per object!
4. Ensure `subject` and `clothing` remain identical across all objects, but vary the `technical_specs`, `pose`, and `environment`.
5. HYPER-REALISM RULE: Strictly enforce real-world anatomical proportions, physically accurate lighting, and authentic lens behaviors (depth of field, focal length).

Format:
{{
  "results": [
    {base_json_struct},
    ... (repeat {count} times)
  ]
}}"""
