"""
Rapid-Fire Assessment Service
Provides 4-option multiple choice agriculture questions with 30-second timers.
Includes a rich curated question bank across all 6 agriculture topics and
optional LLM-driven generation with similarity deduplication.
"""
import json
import logging
import os
import random
from typing import Dict, Any, List, Optional, Tuple

from app.services.question_similarity import is_duplicate_or_similar

logger = logging.getLogger(__name__)

# Curated bank of 4-option multiple-choice agriculture questions across 6 core topics
RAPID_FIRE_QUESTION_BANK: Dict[str, List[Dict[str, Any]]] = {
    "agricultural_concepts": [
        {
            "id": "ac_01",
            "topic": "agricultural_concepts",
            "question": "Which soil texture generally has the highest cation exchange capacity (CEC) and water holding capacity?",
            "options": [
                "A) Coarse sand",
                "B) Sandy loam",
                "C) Heavy clay",
                "D) Silt loam"
            ],
            "correct_option": "C",
            "explanation": "Clay particles have high surface area and negative charges, giving them the highest CEC and water holding capacity."
        },
        {
            "id": "ac_02",
            "topic": "agricultural_concepts",
            "question": "What is the primary agronomic benefit of incorporating leguminous crops into a crop rotation cycle?",
            "options": [
                "A) Depleting subsoil potassium reserves",
                "B) Biological atmospheric nitrogen fixation via Rhizobium symbiosis",
                "C) Increasing soil salinity levels",
                "D) Eliminating all soil-borne weed seeds permanently"
            ],
            "correct_option": "B",
            "explanation": "Legumes fix atmospheric nitrogen through symbiotic Rhizobium bacteria in their root nodules."
        },
        {
            "id": "ac_03",
            "topic": "agricultural_concepts",
            "question": "At what seed moisture content should cereal grains ideally be dried for safe long-term godown storage?",
            "options": [
                "A) 18% to 22%",
                "B) 10% to 12%",
                "C) 25% to 30%",
                "D) Less than 5%"
            ],
            "correct_option": "B",
            "explanation": "Moisture levels below 12% prevent fungal growth, spoilage, and insect proliferation in stored grains."
        },
        {
            "id": "ac_04",
            "topic": "agricultural_concepts",
            "question": "What is the optimum soil pH range for most arable crops to ensure maximum availability of essential nutrients?",
            "options": [
                "A) 4.0 - 5.0",
                "B) 6.0 - 7.5",
                "C) 8.5 - 9.5",
                "D) 3.0 - 4.0"
            ],
            "correct_option": "B",
            "explanation": "Most macronutrients and micronutrients have optimal bioavailability in slightly acidic to neutral soils (pH 6.0-7.5)."
        },
        {
            "id": "ac_05",
            "topic": "agricultural_concepts",
            "question": "Which physiological process in crops is directly regulated by stomatal opening and closing?",
            "options": [
                "A) Transpiration and gaseous exchange (CO2/O2)",
                "B) Seed germination under darkness",
                "C) Root capillary nutrient absorption exclusively",
                "D) Soil microbial mineralization"
            ],
            "correct_option": "A",
            "explanation": "Stomata control the rate of transpiration and exchange of CO2 and O2 during photosynthesis and respiration."
        },
        {
            "id": "ac_06",
            "topic": "agricultural_concepts",
            "question": "What does 'field capacity' of a soil represent after saturation and free drainage?",
            "options": [
                "A) Total water content when all pores are flooded",
                "B) Water remaining after gravitational water has drained away",
                "C) Soil moisture level at permanent wilting point",
                "D) Zero moisture content in oven-dry soil"
            ],
            "correct_option": "B",
            "explanation": "Field capacity is the amount of soil moisture held in soil after excess water has drained away by gravity."
        },
    ],
    "crop_management_practices": [
        {
            "id": "cm_01",
            "topic": "crop_management_practices",
            "question": "Which irrigation method delivers the highest water-use efficiency (85-95%) by applying water directly to root zones?",
            "options": [
                "A) Furrow irrigation",
                "B) Basin flood irrigation",
                "C) Drip (trickle) irrigation",
                "D) Wild border flooding"
            ],
            "correct_option": "C",
            "explanation": "Drip irrigation minimizes evaporation and run-off by delivering water directly to crop root zones."
        },
        {
            "id": "cm_02",
            "topic": "crop_management_practices",
            "question": "In the System of Rice Intensification (SRI), what is the recommended age of young paddy seedlings for transplanting?",
            "options": [
                "A) 8 to 12 days (single seedling per hill)",
                "B) 25 to 30 days (bunch of 5 seedlings)",
                "C) 40 to 45 days",
                "D) 60 days after tillering"
            ],
            "correct_option": "A",
            "explanation": "SRI advocates transplanting very young single seedlings (8-12 days old) with wide square spacing."
        },
        {
            "id": "cm_03",
            "topic": "crop_management_practices",
            "question": "What is the primary objective of mulching in vegetable cultivation?",
            "options": [
                "A) Increasing atmospheric carbon dioxide locally",
                "B) Conserving soil moisture and suppressing weed emergence",
                "C) Attracting beneficial pollinating bees to stems",
                "D) Hastening flowering by shading leaves"
            ],
            "correct_option": "B",
            "explanation": "Mulching moderates soil temperature, conserves moisture, and blocks sunlight from weed seeds."
        },
        {
            "id": "cm_04",
            "topic": "crop_management_practices",
            "question": "When applying pre-emergence herbicides like Pendimethalin, what soil condition is required for effective weed control?",
            "options": [
                "A) Completely dry, dusty cracked soil surface",
                "B) Standing deep water of 10 cm depth",
                "C) Adequate soil moisture at or near field capacity",
                "D) Deep hard pan formation"
            ],
            "correct_option": "C",
            "explanation": "Adequate soil surface moisture is critical for herbicide activation and absorption by emerging weed radicles."
        },
        {
            "id": "cm_05",
            "topic": "crop_management_practices",
            "question": "What is the key advantage of adopting Zero-Tillage (Direct Drilling) in wheat cultivation after rice harvest?",
            "options": [
                "A) Timely sowing and fuel saving by eliminating land prep operations",
                "B) Complete eradication of Phalaris minor without spraying",
                "C) Warming up the soil by deep plowing",
                "D) Increasing soil compaction intentionally"
            ],
            "correct_option": "A",
            "explanation": "Zero tillage saves 10-15 days, avoids delays in sowing wheat, and conserves residual soil moisture."
        },
        {
            "id": "cm_06",
            "topic": "crop_management_practices",
            "question": "What is the recommended practice for split application of nitrogen (urea) in long-duration crops like maize or sugarcane?",
            "options": [
                "A) Applying 100% of nitrogen during sowing as basal",
                "B) Basal dose followed by top dressing at knee-high and tasseling stages",
                "C) Only spraying nitrogen after harvest",
                "D) Mixing all nitrogen with standing flood water only once"
            ],
            "correct_option": "B",
            "explanation": "Split application synchronizes nutrient availability with peak crop uptake and reduces leaching losses."
        },
    ],
    "pest_and_disease_management": [
        {
            "id": "pd_01",
            "topic": "pest_and_disease_management",
            "question": "What classic 'dead heart' and 'white earhead' symptom in paddy fields is caused by which insect pest?",
            "options": [
                "A) Rice Yellow Stem Borer (Scirpophaga incertulas)",
                "B) Brown Planthopper (Nilaparvata lugens)",
                "C) Rice Hispa",
                "D) Green Leafhopper"
            ],
            "correct_option": "A",
            "explanation": "Stem borer larvae feed inside the stem, causing dead hearts in vegetative phase and white earheads at heading."
        },
        {
            "id": "pd_02",
            "topic": "pest_and_disease_management",
            "question": "Which insect vector is responsible for transmitting Yellow Vein Mosaic Virus (YVMV) in okra (bhendi)?",
            "options": [
                "A) Whitefly (Bemisia tabaci)",
                "B) Mustard Aphid",
                "C) Fall Armyworm",
                "D) Termite"
            ],
            "correct_option": "A",
            "explanation": "Whitefly (Bemisia tabaci) is the sap-sucking vector that transmits YVMV in okra and chilli."
        },
        {
            "id": "pd_03",
            "topic": "pest_and_disease_management",
            "question": "Which egg parasitoid wasp is widely utilized as an effective biological control agent against lepidopteran stem borers?",
            "options": [
                "A) Trichogramma chilonis",
                "B) Apis cerana",
                "C) Bombyx mori",
                "D) Tribolium castaneum"
            ],
            "correct_option": "A",
            "explanation": "Trichogramma wasps parasitize the eggs of lepidopteran moths before caterpillars hatch and bore into crop stems."
        },
        {
            "id": "pd_04",
            "topic": "pest_and_disease_management",
            "question": "Which active ingredient is an organic botanical insecticide extracted from the neem tree (Azadirachta indica)?",
            "options": [
                "A) Azadirachtin",
                "B) Chlorpyrifos",
                "C) Carbendazim",
                "D) Imidacloprid"
            ],
            "correct_option": "A",
            "explanation": "Azadirachtin acts as an antifeedant, repellent, and insect growth regulator."
        },
        {
            "id": "pd_05",
            "topic": "pest_and_disease_management",
            "question": "Which fungicide group is typically applied for controlling downy mildew and late blight diseases caused by oomycetes?",
            "options": [
                "A) Systemic acylalanines (e.g., Metalaxyl) or copper oxychloride",
                "B) Sulfur wettable powder exclusively",
                "C) Streptomycin antibiotic alone",
                "D) Organophosphate insecticides"
            ],
            "correct_option": "A",
            "explanation": "Metalaxyl and copper-based fungicides are highly effective against oomycete plant pathogens like late blight."
        },
        {
            "id": "pd_06",
            "topic": "pest_and_disease_management",
            "question": "What is the primary mode of action of yellow sticky traps installed in vegetable fields?",
            "options": [
                "A) Attracting and trapping sucking pests like whiteflies and aphids visually",
                "B) Releasing chemical mating pheromones",
                "C) Killing subterranean nematodes by root diffusion",
                "D) Repelling nocturnal moths with sound"
            ],
            "correct_option": "A",
            "explanation": "Yellow color phototactically attracts sucking insects such as whiteflies, aphids, and leafminers."
        },
    ],
    "nutrient_deficiencies": [
        {
            "id": "nd_01",
            "topic": "nutrient_deficiencies",
            "question": "Because Nitrogen is highly mobile within the plant, where do visual deficiency symptoms (chlorosis) first appear?",
            "options": [
                "A) Older lower leaves",
                "B) Youngest terminal shoot buds",
                "C) Only on flower petals",
                "D) Seed pods exclusively"
            ],
            "correct_option": "A",
            "explanation": "Mobile nutrients like N, P, K, and Mg are translocated from older tissues to young growing tips, showing symptoms on older leaves first."
        },
        {
            "id": "nd_02",
            "topic": "nutrient_deficiencies",
            "question": "What micronutrient deficiency is famously responsible for 'Khaira disease' in wetland paddy seedlings?",
            "options": [
                "A) Zinc (Zn)",
                "B) Copper (Cu)",
                "C) Molybdenum (Mo)",
                "D) Chlorine (Cl)"
            ],
            "correct_option": "A",
            "explanation": "Khaira disease in rice is caused by Zinc deficiency, characterized by rusty brown spots on leaves."
        },
        {
            "id": "nd_03",
            "topic": "nutrient_deficiencies",
            "question": "Purple or reddish-bronze discoloration on the leaves and stems of maize plants is a typical sign of deficiency of which element?",
            "options": [
                "A) Phosphorus (P)",
                "B) Iron (Fe)",
                "C) Potassium (K)",
                "D) Boron (B)"
            ],
            "correct_option": "A",
            "explanation": "Phosphorus deficiency restricts ATP synthesis and causes anthocyanin accumulation, producing purple discoloration."
        },
        {
            "id": "nd_04",
            "topic": "nutrient_deficiencies",
            "question": "'Blossom end rot' in tomatoes and black heart in celery are physiological disorders caused by localized deficiency of which nutrient?",
            "options": [
                "A) Calcium (Ca)",
                "B) Potassium (K)",
                "C) Sulfur (S)",
                "D) Manganese (Mn)"
            ],
            "correct_option": "A",
            "explanation": "Calcium is immobile; inadequate calcium transport to rapidly growing fruit tips causes cell membrane collapse and blossom end rot."
        },
        {
            "id": "nd_05",
            "topic": "nutrient_deficiencies",
            "question": "Interveinal chlorosis appearing specifically on young apical leaves in calcareous soils is typically caused by deficiency of:",
            "options": [
                "A) Iron (Fe)",
                "B) Nitrogen (N)",
                "C) Phosphorus (P)",
                "D) Potassium (K)"
            ],
            "correct_option": "A",
            "explanation": "Iron is immobile and becomes unavailable at high pH, resulting in sharp interveinal chlorosis on youngest leaves."
        },
        {
            "id": "nd_06",
            "topic": "nutrient_deficiencies",
            "question": "Marginal scorching and leaf necrosis ('firing' of leaf edges) in banana and potato indicates severe deficiency of:",
            "options": [
                "A) Potassium (K)",
                "B) Zinc (Zn)",
                "C) Boron (B)",
                "D) Cobalt (Co)"
            ],
            "correct_option": "A",
            "explanation": "Potassium deficiency causes marginal chlorosis followed by burning/necrosis of leaf margins on older leaves."
        },
    ],
    "weather_related_advisories": [
        {
            "id": "wa_01",
            "topic": "weather_related_advisories",
            "question": "When a forecast predicts severe night frost during flowering or fruit set, which management measure helps protect crops?",
            "options": [
                "A) Light surface irrigation and creating smoke screens (smudging) at night",
                "B) Applying heavy nitrogenous fertilizer immediately",
                "C) Deep chisel subsoiling during midnight",
                "D) Withholding all water for two weeks"
            ],
            "correct_option": "A",
            "explanation": "Moist soil holds more heat than dry soil, and smoke prevents rapid radiational cooling of the canopy."
        },
        {
            "id": "wa_02",
            "topic": "weather_related_advisories",
            "question": "What is the consequence of an El Niño climate phase on the South Asian summer monsoon (Kharif season)?",
            "options": [
                "A) Frequently associated with suppressed rainfall and drought risk",
                "B) Consistent unseasonal snowfall across peninsular plains",
                "C) Elimination of the winter season permanently",
                "D) Doubling of average monsoon precipitation everywhere"
            ],
            "correct_option": "A",
            "explanation": "El Niño conditions over the tropical Pacific are statistically linked with weaker monsoon rainfall and dry spells in India."
        },
        {
            "id": "wa_03",
            "topic": "weather_related_advisories",
            "question": "Under a forecast of continuous rain and high relative humidity (>90%) for 4-5 days, which crop risk increases sharply?",
            "options": [
                "A) Fungal foliar infections like blast, blight, and downy mildew",
                "B) Severe drought wilt and heat scorch",
                "C) Wind erosion of topsoil",
                "D) Depletion of water tables"
            ],
            "correct_option": "A",
            "explanation": "Prolonged high leaf wetness and humidity create ideal conditions for fungal spore germination and rapid spread."
        },
        {
            "id": "wa_04",
            "topic": "weather_related_advisories",
            "question": "In agrometeorology, which thermal accumulation index is used to forecast crop developmental stages and maturity dates?",
            "options": [
                "A) Growing Degree Days (GDD)",
                "B) Photosynthetically Active Radiation (PAR)",
                "C) Vapor Pressure Deficit (VPD)",
                "D) Leaf Area Index (LAI)"
            ],
            "correct_option": "A",
            "explanation": "Growing Degree Days quantify thermal heat units accumulated above a base threshold temperature to forecast crop phenology."
        },
        {
            "id": "wa_05",
            "topic": "weather_related_advisories",
            "question": "To prevent lodging and pesticide wash-off, when should foliar spraying of agrochemicals be strictly avoided?",
            "options": [
                "A) During impending heavy rainfall or wind speeds exceeding 15-20 km/h",
                "B) Early morning when dew has just dried",
                "C) In calm overcast weather",
                "D) In late afternoon"
            ],
            "correct_option": "A",
            "explanation": "Rain washes off chemicals into soil, and high wind causes severe drift away from target foliage."
        },
        {
            "id": "wa_06",
            "topic": "weather_related_advisories",
            "question": "What advisory should be issued to farmers harvesting grains when cyclone warnings are announced by IMD?",
            "options": [
                "A) Expedite immediate harvesting at physiological maturity and shift produce to covered warehouses",
                "B) Leave harvested bundles open in low-lying waterlogged fields",
                "C) Irrigate standing mature fields heavily",
                "D) Broadcast seeds in advance of waterlogging"
            ],
            "correct_option": "A",
            "explanation": "Immediate harvesting and safe shelter prevents severe shattering, lodging, and grain sprouting in unharvested crops."
        },
    ],
    "field_level_technical_issues": [
        {
            "id": "ft_01",
            "topic": "field_level_technical_issues",
            "question": "What soil amendment is applied to reclaim sodic (alkali) soils characterized by high exchangeable sodium percentage (ESP > 15%)?",
            "options": [
                "A) Agricultural Gypsum (Calcium sulfate)",
                "B) Quicklime (Calcium oxide) on alkaline soils",
                "C) Pure rock salt (Sodium chloride)",
                "D) Ammonium chloride"
            ],
            "correct_option": "A",
            "explanation": "Calcium in gypsum displaces sodium from the soil exchange complex, which is then leached out with good drainage."
        },
        {
            "id": "ft_02",
            "topic": "field_level_technical_issues",
            "question": "What is the primary cause of 'crop lodging' in high-yielding wheat or rice varieties just before maturity?",
            "options": [
                "A) Excessive nitrogen application coupled with dense planting and heavy winds",
                "B) Severe drought stress in root zone",
                "C) Deficient potassium levels during seeding only",
                "D) Use of dwarf varieties exclusively"
            ],
            "correct_option": "A",
            "explanation": "Excess nitrogen causes succulent, elongated lower internodes that easily snap or bend under heavy earheads and wind."
        },
        {
            "id": "ft_03",
            "topic": "field_level_technical_issues",
            "question": "In heavy black cotton soils with poor drainage, which land layout technique prevents waterlogging and improves aeration?",
            "options": [
                "A) Broad Bed and Furrow (BBF) or ridge-and-furrow system",
                "B) Flat deep basin flooding without bunds",
                "C) Excavating deep pits around every plant",
                "D) Compacting the soil with heavy road rollers"
            ],
            "correct_option": "A",
            "explanation": "BBF drains excess surface water along furrows during heavy downpours while keeping crop root beds aerated."
        },
        {
            "id": "ft_04",
            "topic": "field_level_technical_issues",
            "question": "What is the main operational purpose of backwashing a sand media filter in a commercial drip irrigation network?",
            "options": [
                "A) Flushing out trapped silt, organic debris, and algae to restore flow pressure",
                "B) Adding liquid fertilizers into the main pipeline",
                "C) Increasing water temperature before emitter discharge",
                "D) Disinfecting water with chemical chlorine only"
            ],
            "correct_option": "A",
            "explanation": "Backwashing reverses flow to eject captured physical particulates and prevent emitter clogging."
        },
        {
            "id": "ft_05",
            "topic": "field_level_technical_issues",
            "question": "What is the recommended pre-cooling temperature management practice for freshly harvested perishable vegetables (e.g., capsicum, okra)?",
            "options": [
                "A) Rapid field heat removal to 8°C - 12°C using hydrocooling or forced-air cooling",
                "B) Leaving under direct afternoon sunlight for 24 hours",
                "C) Freezing vegetables immediately at -20°C",
                "D) Submerging in hot boiling water"
            ],
            "correct_option": "A",
            "explanation": "Rapidly removing field heat slows down respiration and preserves freshness and post-harvest shelf life."
        },
        {
            "id": "ft_06",
            "topic": "field_level_technical_issues",
            "question": "When soil develops a dense 'plow pan' (hardpan) at 20-30 cm depth due to repeated rotary tilling, which implement is used for remediation?",
            "options": [
                "A) Subsoiler (chisel plow)",
                "B) Disc harrow",
                "C) Spike tooth peg harrow",
                "D) Rotavator at shallow depth"
            ],
            "correct_option": "A",
            "explanation": "A subsoiler shatters dense subsoil hardpans without inverting soil layers, restoring root penetration and drainage."
        },
    ],
}


# Curated bank of 4-option image-based identification MCQs (3 questions per attempt across 3 attempts = 9 total)
IMAGE_QUESTION_BANK: Dict[int, List[Dict[str, Any]]] = {
    1: [
        {
            "id": "img_att1_01",
            "topic": "nutrient_deficiencies",
            "question": "Examine the leaf specimen shown in the image below. Which nutrient deficiency is primarily indicated by this distinct interveinal chlorosis with dark green veins on young foliage?",
            "options": [
                "A) Iron (Fe) chlorosis",
                "B) Nitrogen (N) deficiency",
                "C) Potassium (K) deficiency",
                "D) Phosphorus (P) deficiency",
            ],
            "correct_option": "A",
            "image_url": "/images/assessment/fe_chlorosis.png",
            "explanation": "Iron is immobile in plants; deficiency symptoms appear first on younger leaves as sharp interveinal yellowing with dark green veins.",
        },
        {
            "id": "img_att1_02",
            "topic": "pest_and_disease_management",
            "question": "Identify the agricultural pest and characteristic fruit damage shown in the specimen photo below:",
            "options": [
                "A) Tomato Fruit Borer (Helicoverpa armigera)",
                "B) Cotton Whitefly (Bemisia tabaci)",
                "C) Green Peach Aphid (Myzus persicae)",
                "D) Serpentine Leaf Miner (Liriomyza trifolii)",
            ],
            "correct_option": "A",
            "image_url": "/images/assessment/tomato_fruit_borer.png",
            "explanation": "Helicoverpa armigera larvae bore circular entry holes into tomato/cotton fruits with visible fecal frass surrounding the cavity.",
        },
        {
            "id": "img_att1_03",
            "topic": "pest_and_disease_management",
            "question": "The concentric 'target-board' necrotic leaf spots shown in the specimen below are a diagnostic foliar symptom of which crop disease?",
            "options": [
                "A) Early Blight (Alternaria solani)",
                "B) Bacterial Wilt (Ralstonia solanacearum)",
                "C) Tomato Mosaic Virus (ToMV)",
                "D) Damping-off (Pythium aphanidermatum)",
            ],
            "correct_option": "A",
            "image_url": "/images/assessment/early_blight.png",
            "explanation": "Alternaria solani produces characteristic dark brown spots with concentric ridges resembling a target-board, bordered by yellow chlorotic halos.",
        },
    ],
    2: [
        {
            "id": "img_att2_01",
            "topic": "pest_and_disease_management",
            "question": "Examine the maize whorl damage and larva shown in the image below. Which invasive pest is responsible for this ragged feeding and sawdust-like frass?",
            "options": [
                "A) Fall Armyworm (Spodoptera frugiperda)",
                "B) Pink Stem Borer (Sesamia inferens)",
                "C) Sorghum Shoot Fly (Atherigona soccata)",
                "D) Maize Aphid (Rhopalosiphum maidis)",
            ],
            "correct_option": "A",
            "image_url": "/images/assessment/fall_armyworm.png",
            "explanation": "Fall Armyworm (Spodoptera frugiperda) feeds voraciously in cereal whorls, causing ragged perforated leaves and heavy sawdust-like fecal deposits.",
        },
        {
            "id": "img_att2_02",
            "topic": "pest_and_disease_management",
            "question": "The white, talcum powder-like fungal patches covering the upper leaf surface in the specimen below are characteristic of which fungal disease?",
            "options": [
                "A) Powdery Mildew (Erysiphe / Oidium spp.)",
                "B) Downy Mildew (Pseudoperonospora cubensis)",
                "C) Anthracnose (Colletotrichum gloeosporioides)",
                "D) Black Rot (Xanthomonas campestris)",
            ],
            "correct_option": "A",
            "image_url": "/images/assessment/powdery_mildew.png",
            "explanation": "Powdery mildew produces superficial white, powdery mycelial and conidial growth predominantly on the upper surfaces of leaves and stems.",
        },
        {
            "id": "img_att2_03",
            "topic": "nutrient_deficiencies",
            "question": "Examine the foliar chlorosis pattern in the specimen below. Which essential nutrient deficiency exhibits this classic V-shaped yellowing starting from the leaf tip along the midrib?",
            "options": [
                "A) Nitrogen (N) deficiency",
                "B) Magnesium (Mg) deficiency",
                "C) Zinc (Zn) deficiency",
                "D) Sulphur (S) deficiency",
            ],
            "correct_option": "A",
            "image_url": "/images/assessment/nitrogen_deficiency.png",
            "explanation": "Nitrogen is mobile in plants and translocates to young growth, causing older lower leaves to exhibit characteristic inverted V-shaped chlorosis extending from the tip.",
        },
    ],
    3: [
        {
            "id": "img_att3_01",
            "topic": "pest_and_disease_management",
            "question": "In the rice hill specimen shown below, what is the agronomic symptom and causative pest of the withered, dry central apical shoot ('Dead Heart')?",
            "options": [
                "A) Yellow Stem Borer (Scirpophaga incertulas) causing Dead Heart",
                "B) Rice Gall Midge (Orseolia oryzae) causing Silver Shoot",
                "C) Brown Plant Hopper (Nilaparvata lugens) causing Hopper Burn",
                "D) Rice Hispa (Dicladispa armigera) causing White Streaks",
            ],
            "correct_option": "A",
            "image_url": "/images/assessment/rice_stem_borer.png",
            "explanation": "Yellow Stem Borer larvae bore into the central stem at tillering stage, cutting the growing point and producing the classic dry 'Dead Heart' symptom.",
        },
        {
            "id": "img_att3_02",
            "topic": "pest_and_disease_management",
            "question": "The spindle-shaped lesions with reddish-brown borders and greyish centers shown on the rice leaf below are diagnostic symptoms of which major disease?",
            "options": [
                "A) Rice Blast (Magnaporthe oryzae / Pyricularia oryzae)",
                "B) Sheath Blight (Rhizoctonia solani)",
                "C) Bacterial Leaf Blight (Xanthomonas oryzae pv. oryzae)",
                "D) False Smut (Ustilaginoidea virens)",
            ],
            "correct_option": "A",
            "image_url": "/images/assessment/rice_blast.png",
            "explanation": "Magnaporthe oryzae produces diagnostic eye-shaped or diamond-spindle foliar lesions with brown margins and grey/white necrotic centers.",
        },
        {
            "id": "img_att3_03",
            "topic": "nutrient_deficiencies",
            "question": "Examine the leaf margins in the specimen below. Which nutrient deficiency characteristically manifests as marginal chlorosis followed by scorched, firing edges along older leaf margins?",
            "options": [
                "A) Potassium (K) deficiency",
                "B) Calcium (Ca) blossom-end rot",
                "C) Manganese (Mn) deficiency",
                "D) Boron (B) deficiency",
            ],
            "correct_option": "A",
            "image_url": "/images/assessment/potassium_deficiency.png",
            "explanation": "Potassium deficiency manifests as chlorosis followed by necrotic scorching ('firing') along the outer margins and tips of older leaves.",
        },
    ],
}


class RapidFireService:
    """Manages rapid-fire MCQs with 4 options, 30-second timers, and image identification."""

    def __init__(self):
        self.bank = RAPID_FIRE_QUESTION_BANK
        self.image_bank = IMAGE_QUESTION_BANK

    def _resolve_image_url(self, raw_url: Optional[str]) -> Optional[str]:
        """Resolves image extension (.png, .jpg, .jpeg, .webp, .svg) depending on what exists on disk."""
        if not raw_url:
            return None
        base_name = raw_url.rsplit(".", 1)[0]
        filename_base = base_name.split("/")[-1]
        public_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "frontend", "public", "images", "assessment"))
        for ext in [".png", ".jpg", ".jpeg", ".webp", ".svg"]:
            if os.path.exists(os.path.join(public_dir, f"{filename_base}{ext}")):
                return f"{base_name}{ext}"
        return raw_url

    def get_image_question(self, attempt_number: int = 1, slot_idx: int = 0) -> Dict[str, Any]:
        """Return designated image identification MCQ for the candidate's attempt and slot."""
        att = min(max(1, attempt_number), 3)
        questions = self.image_bank.get(att) or self.image_bank[1]
        idx = min(max(0, slot_idx), len(questions) - 1)
        item = questions[idx]
        return {
            "question": item["question"],
            "options": list(item["options"]),
            "correct_option": item.get("correct_option", "A"),
            "topic": item.get("topic", "pest_and_disease_management"),
            "phase": "rapid_fire",
            "time_limit_seconds": 30,
            "explanation": item.get("explanation", ""),
            "image_url": self._resolve_image_url(item.get("image_url")),
        }

    def get_bank_question(
        self,
        topic: str,
        excluded_questions: Optional[List[str]] = None,
        attempt_number: int = 1,
    ) -> Dict[str, Any]:
        """
        Pulls an unused 4-option MCQ from the bank matching the requested topic,
        avoiding past and recent questions via similarity check.
        Uses attempt-based prioritization so Attempts 1, 2, and 3 get distinct questions.
        """
        excluded = excluded_questions or []
        candidates = list(self.bank.get(topic, []))
        if not candidates:
            for t, q_list in self.bank.items():
                if q_list:
                    candidates.extend(q_list)

        # Attempt-based slicing: Attempt 1 prioritizes [0,1], Attempt 2 [2,3], Attempt 3 [4,5]
        att = min(max(1, attempt_number), 3)
        base_offset = (att - 1) * 2
        ordered_candidates = []
        for i in range(len(candidates)):
            ordered_candidates.append(candidates[(base_offset + i) % len(candidates)])

        for item in ordered_candidates:
            is_dup, _, _ = is_duplicate_or_similar(item["question"], excluded, threshold=0.55)
            if not is_dup:
                return {
                    "question": item["question"],
                    "options": list(item["options"]),
                    "correct_option": item.get("correct_option", "A"),
                    "topic": item.get("topic", topic),
                    "phase": "rapid_fire",
                    "time_limit_seconds": 30,
                    "explanation": item.get("explanation", ""),
                    "image_url": None,
                }

        # Fallback 1: Search across any other bank topic for an unused question not in excluded
        for other_topic, other_candidates in self.bank.items():
            for item in other_candidates:
                is_dup, _, _ = is_duplicate_or_similar(item["question"], excluded, threshold=0.55)
                if not is_dup:
                    return {
                        "question": item["question"],
                        "options": list(item["options"]),
                        "correct_option": item.get("correct_option", "A"),
                        "topic": item.get("topic", topic),
                        "phase": "rapid_fire",
                        "time_limit_seconds": 30,
                        "explanation": item.get("explanation", ""),
                        "image_url": None,
                    }

        # Fallback 2: Select candidate with lowest similarity score to excluded
        best_candidate = None
        min_score = 1.0
        for item in candidates:
            _, _, score = is_duplicate_or_similar(item["question"], excluded, threshold=1.0)
            if score < min_score:
                min_score = score
                best_candidate = item

        if best_candidate:
            return {
                "question": best_candidate["question"],
                "options": list(best_candidate["options"]),
                "correct_option": best_candidate.get("correct_option", "A"),
                "topic": best_candidate.get("topic", topic),
                "phase": "rapid_fire",
                "time_limit_seconds": 30,
                "explanation": best_candidate.get("explanation", ""),
                "image_url": None,
            }

        # Hard fallback
        return {
            "question": "What is the primary indicator of Nitrogen (N) deficiency in cereal crops?",
            "options": [
                "A) Interveinal chlorosis on young upper leaves",
                "B) General yellowing (chlorosis) starting on older lower leaves",
                "C) Purple pigmentation on leaf margins",
                "D) Marginal leaf scorch and burning of tips"
            ],
            "correct_option": "B",
            "topic": topic or "nutrient_deficiencies",
            "phase": "rapid_fire",
            "time_limit_seconds": 30,
            "explanation": "Nitrogen is mobile in plants and translocates from older leaves to younger tissues.",
            "image_url": None,
        }

    async def get_rapid_fire_question(
        self,
        topic: str,
        excluded_questions: Optional[List[str]] = None,
        candidate_data: Optional[Dict[str, Any]] = None,
        attempt_number: int = 1,
        is_image_question: bool = False,
        image_slot_index: int = 0,
    ) -> Dict[str, Any]:
        """
        Retrieve a rapid-fire question for the candidate.
        If is_image_question is True, pulls the corresponding image identification MCQ.
        Otherwise attempts dynamic generation with deduplication, falling back to bank.
        """
        if is_image_question:
            return self.get_image_question(attempt_number=attempt_number, slot_idx=image_slot_index)

        excluded = excluded_questions or []
        # Attempt LLM generation if candidate has specific crops or background
        try:
            from app.llm.service import llm_service
            topic_readable = topic.replace("_", " ").title()
            crops = (candidate_data or {}).get("crops_grown", "")
            region = (candidate_data or {}).get("state", "")

            prompt = (
                f"You are generating ONE rapid-fire multiple-choice question for an agriculture assessment.\n"
                f"Topic: {topic_readable}\n"
            )
            if crops:
                prompt += f"Context crop (if applicable): {crops}\n"
            if region:
                prompt += f"Region: {region}\n"

            if excluded:
                prompt += "\nDO NOT repeat or reword these already asked questions:\n"
                for eq in excluded[-10:]:
                    prompt += f"- {eq}\n"

            prompt += (
                "\nINSTRUCTIONS:\n"
                "1. Generate ONE focused, practical factual agriculture question.\n"
                "2. Provide EXACTLY 4 options labeled A), B), C), and D).\n"
                "3. One option must be unambiguously correct.\n"
                "4. Format the output STRICTLY as valid JSON with keys:\n"
                '   {"question": "...", "options": ["A) ...", "B) ...", "C) ...", "D) ..."], "correct_option": "A"}\n'
                "Output ONLY the JSON object, nothing else."
            )

            raw = await llm_service.chat_completion(
                messages=[{"role": "user", "content": prompt}],
                system_prompt="You are a strict agricultural assessment examination system that outputs valid JSON only.",
                temperature=0.6,
                max_tokens=300,
            )

            if raw:
                cleaned = raw.strip()
                if cleaned.startswith("```json"):
                    cleaned = cleaned[7:]
                if cleaned.endswith("```"):
                    cleaned = cleaned[:-3]
                cleaned = cleaned.strip()

                parsed = json.loads(cleaned)
                q_text = parsed.get("question", "").strip()
                opts = parsed.get("options", [])
                correct = parsed.get("correct_option", "A").strip()

                if (
                    q_text
                    and len(q_text) >= 15
                    and isinstance(opts, list)
                    and len(opts) == 4
                    and all(isinstance(o, str) and len(o.strip()) > 1 for o in opts)
                ):
                    is_dup, _, _ = is_duplicate_or_similar(q_text, excluded, threshold=0.60)
                    if not is_dup:
                        return {
                            "question": q_text,
                            "options": opts,
                            "correct_option": correct,
                            "topic": topic,
                            "phase": "rapid_fire",
                            "time_limit_seconds": 30,
                            "explanation": parsed.get("explanation", ""),
                        }
        except Exception as e:
            logger.debug(f"[RapidFireService] LLM MCQ generation skipped or failed: {e}")

        # Reliable bank fallback
        return self.get_bank_question(topic=topic, excluded_questions=excluded, attempt_number=attempt_number)


# Singleton instance
rapid_fire_service = RapidFireService()
