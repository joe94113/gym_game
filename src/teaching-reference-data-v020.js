// Dated public-source checks. These are not professional approval or motion capture.
export const TEACHING_REFERENCE_DATE='2026-11-03';
export const teachingReferenceChecks=[
  {
    "id": "dumbbell-curl",
    "kind": "direct_instruction",
    "checkedOn": "2026-11-03",
    "source": {
      "label": "Mayo Clinic",
      "title": "Video: Biceps curl with dumbbell",
      "url": "https://www.mayoclinic.org/healthy-lifestyle/fitness/multimedia/biceps-curl/vid-20084675"
    },
    "sources": [
      {
        "label": "Mayo Clinic",
        "title": "Video: Biceps curl with dumbbell",
        "url": "https://www.mayoclinic.org/healthy-lifestyle/fitness/multimedia/biceps-curl/vid-20084675"
      }
    ],
    "scope": "雙啞鈴彎舉；來源允許站姿與雙側操作。",
    "checkedParts": [
      "起始設定",
      "主要動作",
      "控制回程"
    ],
    "gaps": [
      "來源未涵蓋架上取鈴、搬運與歸位。"
    ],
    "cues": [
      "站穩，啞鈴自然垂在身側，手腕保持自然。",
      "上臂靠近身體，慢慢彎肘，不用身體晃動把重量甩起。",
      "控制伸肘回到起點，避免突然鬆手或甩下。"
    ],
    "animation": {
      "status": "not-reviewed",
      "notes": "本次閱讀公開教學與比對程式；未逐格驗收這個動作的完整動畫。"
    },
    "professionalSignoff": false,
    "findings": [
      {
        "file": "src/exercises.js",
        "line": 4,
        "status": "consistent",
        "detail": "主動作說明與目前 Mayo 啞鈴來源相符。"
      },
      {
        "file": "src/exercise-rig.js",
        "line": 103,
        "status": "consistent-at-code-level",
        "detail": "上臂肘點靠近身體，主要以肘部彎曲改變手部位置；這是程式形狀對照，未重做逐格視覺驗收。"
      },
      {
        "file": "src/dumbbell-lifecycle-paths.js",
        "line": 18,
        "status": "source-gap",
        "detail": "架上握持與取放是共用自製過場；來源沒有展示這一段。"
      }
    ],
    "sourceTargets": {
      "primary": [
        "肱二頭肌"
      ],
      "secondary": [
        "前臂穩定"
      ]
    }
  },
  {
    "id": "dumbbell-bench-press",
    "kind": "direct_instruction",
    "checkedOn": "2026-11-03",
    "source": {
      "label": "American Council on Exercise",
      "title": "Chest Press",
      "url": "https://www.acefitness.org/resources/everyone/exercise-library/19/chest-press/"
    },
    "sources": [
      {
        "label": "American Council on Exercise",
        "title": "Chest Press",
        "url": "https://www.acefitness.org/resources/everyone/exercise-library/19/chest-press/"
      },
      {
        "label": "American Council on Exercise",
        "title": "Beginner Strength Training Workout",
        "url": "https://www.acefitness.org/resources/everyone/blog/3714/beginner-strength-training-workout/"
      }
    ],
    "scope": "平板雙啞鈴臥推。資料庫採保護者交接，綜合文章概述獨自坐下後躺。",
    "checkedParts": [
      "起始設定",
      "主要動作",
      "控制回程"
    ],
    "gaps": [
      "坐上椅、後躺有概略文字支持；大腿承鈴、帶鈴坐起與自行歸架仍是程式自製流程，缺少精確示範依據。"
    ],
    "cues": [
      "頭、肩與臀部靠穩椅墊，雙腳有支撐，先握穩再進入推舉位置。",
      "在能控制的胸旁範圍受控下放與推起，手腕不要折。",
      "每次動作慢慢回到起點；結束交接或收鈴應依重量與協助條件安排。"
    ],
    "animation": {
      "status": "not-reviewed",
      "notes": "本次閱讀公開教學與比對程式；未逐格驗收這個動作的完整動畫。"
    },
    "professionalSignoff": false,
    "findings": [
      {
        "file": "src/exercises.js",
        "line": 31,
        "status": "source-improvement",
        "detail": "現有 ACE 綜合文章確實有啞鈴臥推段落，不是錯器材；建議改資料庫 19 為主要來源，綜合文章保留為概略後躺補充。"
      },
      {
        "file": "src/exercise-rig.js",
        "line": 126,
        "status": "consistent-at-code-level",
        "detail": "程式設置躺姿、雙腳落地與握持；不等於已量測背部承重或真人關節負荷。"
      },
      {
        "file": "src/dumbbell-lifecycle-paths.js",
        "line": 34,
        "status": "partial-source-coverage",
        "detail": "先持鈴坐下再後躺與文章概略順序相符；大腿承鈴的接觸與姿勢尚無該來源的具體示範。"
      },
      {
        "file": "src/rig-lifecycle.js",
        "line": 46,
        "status": "source-gap",
        "detail": "離開以帶鈴坐起回走共用反向過場；不能當作原廠或真人教練已驗證的負重離椅方法。"
      }
    ],
    "sourceTargets": {
      "primary": [
        "胸大肌"
      ],
      "secondary": [
        "肱三頭肌",
        "前三角肌"
      ]
    }
  },
  {
    "id": "rope-pushdown",
    "kind": "direct_instruction",
    "checkedOn": "2026-11-03",
    "source": {
      "label": "American Council on Exercise",
      "title": "Triceps Pushdowns",
      "url": "https://www.acefitness.org/resources/everyone/exercise-library/185/triceps-pushdowns/"
    },
    "sources": [
      {
        "label": "American Council on Exercise",
        "title": "Triceps Pushdowns",
        "url": "https://www.acefitness.org/resources/everyone/exercise-library/185/triceps-pushdowns/"
      }
    ],
    "scope": "高滑輪、繩索或手把的三頭下壓：站位、伸肘、控制回程；未描述從架上拿取與放回。",
    "checkedParts": [
      "起始設定",
      "主要動作",
      "控制回程"
    ],
    "gaps": [
      "不要鎖死手肘或用身體晃動帶重量。"
    ],
    "cues": [
      "高滑輪接繩索，站穩、上臂靠身側，手腕自然。",
      "保持上臂穩定，伸肘把繩索往下推。",
      "控制手肘彎回，上臂開始往前跑之前停住。"
    ],
    "animation": {
      "status": "not-reviewed",
      "notes": "本次閱讀公開教學與比對程式；未逐格驗收這個動作的完整動畫。"
    },
    "professionalSignoff": false,
    "sourceTargets": {
      "role": "主要出力",
      "primary": [
        "肱三頭肌"
      ]
    }
  },
  {
    "id": "single-arm-cable-row",
    "kind": "direct_instruction",
    "checkedOn": "2026-11-03",
    "source": {
      "label": "American Council on Exercise",
      "title": "Single Arm Row",
      "url": "https://www.acefitness.org/resources/everyone/exercise-library/337/single-arm-row/"
    },
    "sources": [
      {
        "label": "American Council on Exercise",
        "title": "Single Arm Row",
        "url": "https://www.acefitness.org/resources/everyone/exercise-library/337/single-arm-row/"
      }
    ],
    "scope": "站姿單手滑輪划船；未提供完整器材進出流程。",
    "checkedParts": [
      "起始設定",
      "主要動作",
      "控制回程"
    ],
    "gaps": [
      "來源沒有逐一驗證遊戲標示的各塊背部肌肉。"
    ],
    "cues": [
      "雙腳約髖寬、膝蓋放鬆，單手握住滑輪手把，軀幹站穩。",
      "手把拉向身體，背部保持穩定。",
      "短暫停住後，慢慢把手臂伸回。"
    ],
    "animation": {
      "status": "not-reviewed",
      "notes": "本次閱讀公開教學與比對程式；未逐格驗收這個動作的完整動畫。"
    },
    "professionalSignoff": false,
    "sourceTargets": {
      "role": "主要出力",
      "primary": [
        "背部肌群"
      ]
    }
  },
  {
    "id": "kneeling-hip-flexor-stretch",
    "kind": "direct_instruction",
    "checkedOn": "2026-11-03",
    "source": {
      "label": "American Council on Exercise",
      "title": "Kneeling Hip-flexor Stretch",
      "url": "https://www.acefitness.org/resources/everyone/exercise-library/142/kneeling-hip-flexor-stretch/"
    },
    "sources": [
      {
        "label": "American Council on Exercise",
        "title": "Kneeling Hip-flexor Stretch",
        "url": "https://www.acefitness.org/resources/everyone/exercise-library/142/kneeling-hip-flexor-stretch/"
      }
    ],
    "scope": "半跪姿、骨盆控制與後腿髖屈肌伸展；遊戲循環秒數不是來源的伸展處方。",
    "checkedParts": [
      "起始設定",
      "主要動作",
      "控制回程"
    ],
    "gaps": [
      "避免骨盆前傾與下背過度拱起。",
      "遊戲 12 秒循環只是展示，不是來源建議的保持時間。"
    ],
    "cues": [
      "半跪在軟墊，前腳踩穩、前膝在踝上方，軀幹拉長。",
      "保持骨盆穩定，輕收後側臀部，身體小幅往前。",
      "來源未詳細描述遊戲起身離開流程。"
    ],
    "animation": {
      "status": "not-reviewed",
      "notes": "本次閱讀公開教學與比對程式；未逐格驗收這個動作的完整動畫。"
    },
    "professionalSignoff": false,
    "sourceTargets": {
      "role": "伸展目標，不是主要出力",
      "targets": [
        "後腿髖屈肌群"
      ]
    }
  },
  {
    "id": "dumbbell-hammer-curl",
    "kind": "direct_instruction",
    "checkedOn": "2026-11-03",
    "source": {
      "label": "American Council on Exercise",
      "title": "Hammer Curl",
      "url": "https://www.acefitness.org/resources/everyone/exercise-library/10/hammer-curl/"
    },
    "sources": [
      {
        "label": "American Council on Exercise",
        "title": "Hammer Curl",
        "url": "https://www.acefitness.org/resources/everyone/exercise-library/10/hammer-curl/"
      }
    ],
    "scope": "中立握站姿啞鈴彎舉。",
    "checkedParts": [
      "起始設定",
      "主要動作",
      "控制回程"
    ],
    "gaps": [
      "來源未涵蓋架上取放與步行。"
    ],
    "cues": [
      "掌心相對握穩啞鈴，雙腳站穩。",
      "彎肘把重量帶起，肩部和軀幹保持穩定。",
      "保持握法與手腕自然，慢慢伸肘放回身側。"
    ],
    "animation": {
      "status": "not-reviewed",
      "notes": "本次閱讀公開教學與比對程式；未逐格驗收這個動作的完整動畫。"
    },
    "professionalSignoff": false,
    "findings": [
      {
        "file": "src/extended-exercises.js",
        "line": 8,
        "status": "consistent",
        "detail": "掌心相對與控制彎肘的文字和來源相符。"
      },
      {
        "file": "src/extended-rig.js",
        "line": 67,
        "status": "consistent-at-code-level",
        "detail": "主動作使用中立握與固定上臂，再改變肘部屈曲；尚未以影片逐格確認自然度。"
      }
    ],
    "sourceTargets": {
      "primary": [
        "肱二頭肌",
        "肱肌"
      ],
      "secondary": [
        "前臂肌群"
      ]
    }
  },
  {
    "id": "dumbbell-shoulder-press",
    "kind": "direct_instruction",
    "checkedOn": "2026-11-03",
    "source": {
      "label": "American Council on Exercise",
      "title": "Smart Shoulder Solutions: An Evidence-based Approach to Training the Deltoids",
      "url": "https://www.acefitness.org/resources/pros/expert-articles/9074/smart-shoulder-solutions-an-evidence-based-approach-to-training-the-deltoids/"
    },
    "sources": [
      {
        "label": "American Council on Exercise",
        "title": "Smart Shoulder Solutions: An Evidence-based Approach to Training the Deltoids",
        "url": "https://www.acefitness.org/resources/pros/expert-articles/9074/smart-shoulder-solutions-an-evidence-based-approach-to-training-the-deltoids/"
      },
      {
        "label": "American Council on Exercise",
        "title": "Seated Overhead Press",
        "url": "https://www.acefitness.org/resources/everyone/exercise-library/45/seated-overhead-press/"
      }
    ],
    "scope": "站姿啞鈴肩推；不得把坐姿靠背就位稱為相同全身動作。",
    "checkedParts": [
      "起始設定",
      "主要動作",
      "控制回程"
    ],
    "gaps": [
      "站姿選項與肩推原則有依據；取鈴、翻鈴至肩旁、放回仍缺完整來源。"
    ],
    "cues": [
      "站穩並控制肋骨與骨盆，先把啞鈴穩定帶到肩旁。",
      "平順推到頭部上方，不靠腰部後仰代償。",
      "慢慢回到肩旁可控制的位置，再安排收鈴。"
    ],
    "animation": {
      "status": "not-reviewed",
      "notes": "本次閱讀公開教學與比對程式；未逐格驗收這個動作的完整動畫。"
    },
    "professionalSignoff": false,
    "findings": [
      {
        "file": "src/extended-exercises.js",
        "line": 9,
        "status": "consistent",
        "detail": "現有站穩、控制肋骨、避免腰部後仰的文字與公開教學原則相符。"
      },
      {
        "file": "src/dumbbell-lifecycle-paths.js",
        "line": 40,
        "status": "source-gap",
        "detail": "目前是自製先彎肘再把鈴帶到肩旁的過場，沒有逐格真人素材可支持整段。"
      },
      {
        "file": "src/extended-rig.js",
        "line": 73,
        "status": "review-limit",
        "detail": "姿勢還會套用 capturedPose／下肢參考；不能僅依基礎插值公式宣布最終所有關節角度通過審查。"
      }
    ],
    "sourceTargets": {
      "primary": [
        "三角肌"
      ],
      "secondary": [
        "肱三頭肌",
        "軀幹穩定肌群"
      ]
    }
  },
  {
    "id": "dumbbell-lateral-raise",
    "kind": "direct_instruction",
    "checkedOn": "2026-11-03",
    "source": {
      "label": "American Council on Exercise",
      "title": "Lateral Raise",
      "url": "https://www.acefitness.org/resources/everyone/exercise-library/26/lateral-raise/"
    },
    "sources": [
      {
        "label": "American Council on Exercise",
        "title": "Lateral Raise",
        "url": "https://www.acefitness.org/resources/everyone/exercise-library/26/lateral-raise/"
      }
    ],
    "scope": "雙啞鈴站姿側平舉；來源 354 是滑輪版本，來源 26 才是啞鈴版本。",
    "checkedParts": [
      "起始設定",
      "主要動作",
      "控制回程"
    ],
    "gaps": [
      "主動作有同器材依據；架上取放沒有完整來源。"
    ],
    "cues": [
      "啞鈴放身側，手肘微彎，軀幹站穩。",
      "雙臂往兩側抬到可控制的肩高附近，不聳肩或甩動。",
      "保持自然手腕，控制放回身側。"
    ],
    "animation": {
      "status": "not-reviewed",
      "notes": "本次閱讀公開教學與比對程式；未逐格驗收這個動作的完整動畫。"
    },
    "professionalSignoff": false,
    "findings": [
      {
        "file": "src/extended-exercises.js",
        "line": 30,
        "status": "source-mismatch",
        "detail": "目前雖標啞鈴變式參考，但連到來源 354 的腰高單側滑輪；已有直接相符的來源 26，應替換主要來源。"
      },
      {
        "file": "src/extended-rig.js",
        "line": 69,
        "status": "bounded-demonstration-range",
        "detail": "基礎抬臂角度以 .29+1.10*e 產生，還有參考平面調整；這是固定展示，不能稱由文章完成個別活動度校正。"
      }
    ],
    "sourceTargets": {
      "primary": [
        "三角肌中束"
      ],
      "secondary": [
        "肩帶與上背穩定肌群"
      ]
    }
  },
  {
    "id": "dumbbell-single-arm-row",
    "kind": "related_variant",
    "checkedOn": "2026-11-03",
    "source": {
      "label": "American Council on Exercise",
      "title": "Single-arm Row",
      "url": "https://www.acefitness.org/resources/everyone/exercise-library/126/single-arm-row/"
    },
    "sources": [
      {
        "label": "American Council on Exercise",
        "title": "Single-arm Row",
        "url": "https://www.acefitness.org/resources/everyone/exercise-library/126/single-arm-row/"
      }
    ],
    "scope": "來源膝與手支撐椅面；遊戲一手扶椅、雙腳落地。",
    "checkedParts": [
      "主要動作",
      "控制回程"
    ],
    "gaps": [
      "目前只足以支持划船方向與軀幹穩定；架上取放與站姿扶椅就位未有精確相符來源。"
    ],
    "cues": [
      "遊戲採一手扶椅、雙腳前後站穩的變式；不要把來源的跪椅設定混用。",
      "手肘往後帶，軀幹保持穩定，不用旋轉身體甩起啞鈴。",
      "受控放回手臂下方，支撐手維持穩定。"
    ],
    "animation": {
      "status": "not-reviewed",
      "notes": "本次閱讀公開教學與比對程式；未逐格驗收這個動作的完整動畫。"
    },
    "professionalSignoff": false,
    "findings": [
      {
        "file": "src/extended-exercises.js",
        "line": 31,
        "status": "honest-variant-label",
        "detail": "已標示站姿支撐變式參考，應繼續保留來源差異說明。"
      },
      {
        "file": "src/extended-rig.js",
        "line": 70,
        "status": "variant-difference",
        "detail": "雙腳都在地面、左手支撐椅面；來源明列左膝與左手在椅上。不能把其完整 setup 列為相符。"
      },
      {
        "file": "src/dumbbell-lifecycle-paths.js",
        "line": 43,
        "status": "partial-source-coverage",
        "detail": "先讓支撐手接近椅面再就位；動作方向相符不表示跨全行程的肩、髖、膝負重已檢查。"
      }
    ],
    "sourceTargets": {
      "primary": [
        "背闊肌",
        "上背划船肌群"
      ],
      "secondary": [
        "肱二頭肌",
        "軀幹穩定肌群"
      ]
    }
  },
  {
    "id": "dumbbell-goblet-squat",
    "kind": "direct_instruction",
    "checkedOn": "2026-11-03",
    "source": {
      "label": "American Council on Exercise",
      "title": "Goblet Squat",
      "url": "https://www.acefitness.org/resources/everyone/exercise-library/362/goblet-squat/"
    },
    "sources": [
      {
        "label": "American Council on Exercise",
        "title": "Goblet Squat",
        "url": "https://www.acefitness.org/resources/everyone/exercise-library/362/goblet-squat/"
      }
    ],
    "scope": "胸前抱單鈴深蹲。",
    "checkedParts": [
      "起始設定",
      "主要動作",
      "控制回程"
    ],
    "gaps": [
      "胸前握鈴主動作有依據；從托盤改抱到胸前、放回仍缺精確來源。"
    ],
    "cues": [
      "將單顆啞鈴穩抱胸前，雙腳站穩。",
      "屈髖屈膝下蹲，腳掌維持支撐，做到能穩定控制的深度。",
      "雙腳推地，胸口與骨盆一起回到站姿，不用腰部後仰。"
    ],
    "animation": {
      "status": "not-reviewed",
      "notes": "本次閱讀公開教學與比對程式；未逐格驗收這個動作的完整動畫。"
    },
    "professionalSignoff": false,
    "findings": [
      {
        "file": "src/extended-exercises.js",
        "line": 12,
        "status": "consistent",
        "detail": "胸前抱鈴、屈髖屈膝、推地站回的文字順序與來源相符。"
      },
      {
        "file": "src/extended-rig.js",
        "line": 71,
        "status": "consistent-at-code-level",
        "detail": "基礎姿勢有髖部降低與輕度前傾，啞鈴保持在胸前；第 73 行仍會套用參考姿勢，不應只憑基礎位移宣稱蹲深與角度通過。"
      }
    ],
    "sourceTargets": {
      "primary": [
        "股四頭肌",
        "臀大肌"
      ],
      "secondary": [
        "軀幹穩定肌群"
      ]
    }
  },
  {
    "id": "dumbbell-romanian-deadlift",
    "kind": "direct_instruction",
    "checkedOn": "2026-11-03",
    "source": {
      "label": "National Academy of Sports Medicine",
      "title": "Dumbbell Romanian Deadlift",
      "url": "https://www.nasm.org/resource-center/exercise-library/dumbbell-romanian-deadlift"
    },
    "sources": [
      {
        "label": "National Academy of Sports Medicine",
        "title": "Dumbbell Romanian Deadlift",
        "url": "https://www.nasm.org/resource-center/exercise-library/dumbbell-romanian-deadlift"
      },
      {
        "label": "American Council on Exercise",
        "title": "The ACE Do it Better Series: The Romanian Deadlift",
        "url": "https://www.acefitness.org/continuing-education/certified/may-2025/8865/the-ace-do-it-better-series-the-romanian-deadlift/"
      }
    ],
    "scope": "雙啞鈴髖鉸鏈，不是深蹲或從地板起槓。",
    "checkedParts": [
      "起始設定",
      "主要動作",
      "控制回程"
    ],
    "gaps": [
      "ACE 有一般架高取重原則，兩來源都沒有驗證遊戲固定托盤的整段取放。"
    ],
    "cues": [
      "雙腳約髖寬，膝蓋微彎，啞鈴靠近腿部。",
      "背部維持自然，髖往後送；只降到能控制的腿後側伸展位置。",
      "平順把髖帶回站姿，避免猛拉或腰部過度後仰。"
    ],
    "animation": {
      "status": "not-reviewed",
      "notes": "本次閱讀公開教學與比對程式；未逐格驗收這個動作的完整動畫。"
    },
    "professionalSignoff": false,
    "findings": [
      {
        "file": "src/extended-exercises.js",
        "line": 33,
        "status": "source-improvement",
        "detail": "現有 ACE RDL 明確允許啞鈴，引用可以保留；建議補同器材 NASM 頁以縮小推論範圍。"
      },
      {
        "file": "src/extended-rig.js",
        "line": 72,
        "status": "consistent-at-code-level",
        "detail": "基礎姿勢以髖往後和軀幹前傾為主，不是大幅屈膝蹲下；最終膝角、背部形狀與鈴到腿間距仍需逐格量測與視覺檢查。"
      }
    ],
    "sourceTargets": {
      "primary": [
        "腿後側肌群",
        "臀大肌"
      ],
      "secondary": [
        "背部與軀幹穩定肌群"
      ]
    }
  },
  {
    "id": "standing-hamstring-stretch",
    "kind": "direct_instruction",
    "checkedOn": "2026-11-03",
    "source": {
      "label": "Cambridge University Hospitals NHS Foundation Trust",
      "title": "Stretches for the hip",
      "url": "https://www.cuh.nhs.uk/patient-information/stretches-for-the-hip/"
    },
    "sources": [
      {
        "label": "Cambridge University Hospitals NHS Foundation Trust",
        "title": "Stretches for the hip",
        "url": "https://www.cuh.nhs.uk/patient-information/stretches-for-the-hip/"
      }
    ],
    "scope": "站姿腿後側伸展；臨床衛教並提醒依個人需要選擇。",
    "checkedParts": [
      "起始設定",
      "主要動作",
      "控制回程"
    ],
    "gaps": [
      "逐漸移動，不做到痛；依個人狀況調整。"
    ],
    "cues": [
      "重心留在後腳，前腳往前放。",
      "前腿伸長、脊柱維持自然，讓前腿後側有溫和拉伸感。",
      "來源未提供遊戲完整離開動作。"
    ],
    "animation": {
      "status": "not-reviewed",
      "notes": "本次閱讀公開教學與比對程式；未逐格驗收這個動作的完整動畫。"
    },
    "professionalSignoff": false,
    "sourceTargets": {
      "role": "伸展目標，不是主要出力",
      "targets": [
        "前腿腿後側"
      ]
    }
  },
  {
    "id": "seated-glute-stretch",
    "kind": "related_variant",
    "checkedOn": "2026-11-03",
    "source": {
      "label": "American Council on Exercise",
      "title": "3 Stretches for Opening Up Tight Hips",
      "url": "https://www.acefitness.org/resources/everyone/blog/5681/3-stretches-for-opening-up-tight-hips/"
    },
    "sources": [
      {
        "label": "American Council on Exercise",
        "title": "3 Stretches for Opening Up Tight Hips",
        "url": "https://www.acefitness.org/resources/everyone/blog/5681/3-stretches-for-opening-up-tight-hips/"
      }
    ],
    "scope": "來源是地板盤腿前傾；遊戲是低椅上翹腳，並非同一支撐方式。",
    "checkedParts": [
      "相關變式的動作原則"
    ],
    "gaps": [
      "仍需補椅上版本的相容教學與實際姿勢檢查。"
    ],
    "cues": [
      "來源是地板盤腿；遊戲為低椅、腳踝搭在另一腿上。",
      "只能參考放鬆呼吸、溫和前傾的原則。",
      "來源沒有遊戲椅上版本的起身流程。"
    ],
    "animation": {
      "status": "not-reviewed",
      "notes": "本次閱讀公開教學與比對程式；未逐格驗收這個動作的完整動畫。"
    },
    "professionalSignoff": false,
    "sourceTargets": {
      "role": "伸展目標，不是主要出力",
      "targets": [
        "臀部肌群"
      ]
    }
  },
  {
    "id": "standing-chest-shoulder-stretch",
    "kind": "related_variant",
    "checkedOn": "2026-11-03",
    "source": {
      "label": "American Council on Exercise",
      "title": "Standing Chest Stretch",
      "url": "https://www.acefitness.org/resources/everyone/exercise-library/209/standing-chest-stretch/"
    },
    "sources": [
      {
        "label": "American Council on Exercise",
        "title": "Standing Chest Stretch",
        "url": "https://www.acefitness.org/resources/everyone/exercise-library/209/standing-chest-stretch/"
      }
    ],
    "scope": "肩膀後移、胸口打開及背後握手／毛巾變化；遊戲手臂姿勢不同。",
    "checkedParts": [
      "相關變式的動作原則"
    ],
    "gaps": [
      "不要硬把胸口頂出去或強拉肩膀。"
    ],
    "cues": [
      "站穩、腹部輕收，肩膀向後放。",
      "打開胸口而不拱下背；來源的背後握手與遊戲手臂位置不同。",
      "放鬆回到自然站姿。"
    ],
    "animation": {
      "status": "not-reviewed",
      "notes": "本次閱讀公開教學與比對程式；未逐格驗收這個動作的完整動畫。"
    },
    "professionalSignoff": false,
    "sourceTargets": {
      "role": "伸展目標，不是主要出力",
      "targets": [
        "胸部",
        "肩前側"
      ]
    }
  },
  {
    "id": "standing-calf-stretch",
    "kind": "direct_instruction",
    "checkedOn": "2026-11-03",
    "source": {
      "label": "Health and Wellbeing Queensland",
      "title": "Standing calf stretch",
      "url": "https://hw.qld.gov.au/physical-activity/standing-calf-stretch/"
    },
    "sources": [
      {
        "label": "Health and Wellbeing Queensland",
        "title": "Standing calf stretch",
        "url": "https://hw.qld.gov.au/physical-activity/standing-calf-stretch/"
      }
    ],
    "scope": "扶牆或檯面、前後站姿、後腳跟貼地的小腿伸展；另有後膝彎曲變化。",
    "checkedParts": [
      "起始設定",
      "主要動作",
      "控制回程"
    ],
    "gaps": [
      "後膝彎曲是另一種變化，不混稱同一姿勢。"
    ],
    "cues": [
      "扶穩牆面或檯面，前後站、腳尖向前。",
      "後腳跟留在地面，後腿伸長，身體溫和前移。",
      "換腳時先回到穩定站姿。"
    ],
    "animation": {
      "status": "not-reviewed",
      "notes": "本次閱讀公開教學與比對程式；未逐格驗收這個動作的完整動畫。"
    },
    "professionalSignoff": false,
    "sourceTargets": {
      "role": "伸展目標，不是主要出力",
      "targets": [
        "後腿小腿肌群"
      ]
    }
  },
  {
    "id": "standing-thoracic-rotation",
    "kind": "related_variant",
    "checkedOn": "2026-11-03",
    "source": {
      "label": "American Council on Exercise",
      "title": "How to Increase Upper-body Stability and Mobility",
      "url": "https://www.acefitness.org/resources/pros/expert-articles/5412/how-to-increase-upper-body-stability-and-mobility/"
    },
    "sources": [
      {
        "label": "American Council on Exercise",
        "title": "How to Increase Upper-body Stability and Mobility",
        "url": "https://www.acefitness.org/resources/pros/expert-articles/5412/how-to-increase-upper-body-stability-and-mobility/"
      }
    ],
    "scope": "四足跪姿胸椎旋轉；遊戲站姿只能引用胸椎活動、腰椎穩定的原則。",
    "checkedParts": [
      "相關變式的動作原則"
    ],
    "gaps": [
      "不能以跪姿教學驗證站姿的精確角度與整段動畫。"
    ],
    "cues": [
      "來源為四足跪姿；遊戲為站姿。",
      "可參考讓胸椎活動、腰椎保持穩定的原則。",
      "回到中央再換側。"
    ],
    "animation": {
      "status": "not-reviewed",
      "notes": "本次閱讀公開教學與比對程式；未逐格驗收這個動作的完整動畫。"
    },
    "professionalSignoff": false,
    "sourceTargets": {
      "role": "活動度目標，不是主要出力",
      "targets": [
        "胸椎與胸廓旋轉"
      ]
    }
  },
  {
    "id": "cable-straight-bar-curl",
    "kind": "direct_instruction",
    "checkedOn": "2026-11-03",
    "source": {
      "label": "Gold’s Gym British Columbia",
      "title": "4 Day Machine Focused",
      "url": "https://goldsgymbc.ca/wp-content/uploads/2023/09/GGBC-4-Day-Machine-Focused.pdf"
    },
    "sources": [
      {
        "label": "Gold’s Gym British Columbia",
        "title": "4 Day Machine Focused",
        "url": "https://goldsgymbc.ca/wp-content/uploads/2023/09/GGBC-4-Day-Machine-Focused.pdf"
      }
    ],
    "scope": "Cable Bicep Curl 與 Cable Rope Hammer Curl 的低滑輪設定、握法、屈肘與回程。沒有明述 EZ 桿；不移植該課表的組數。",
    "checkedParts": [
      "起始設定",
      "主要動作",
      "控制回程"
    ],
    "gaps": [
      "不把來源的課表組數當作個人訓練處方。"
    ],
    "cues": [
      "直桿接低滑輪，掌心向上，手臂垂在身前。",
      "彎曲手肘把桿拉向肩膀，短暫停住。",
      "控制直桿下降。"
    ],
    "animation": {
      "status": "not-reviewed",
      "notes": "本次閱讀公開教學與比對程式；未逐格驗收這個動作的完整動畫。"
    },
    "professionalSignoff": false,
    "sourceTargets": {
      "role": "主要出力",
      "primary": [
        "肱二頭肌"
      ]
    }
  },
  {
    "id": "cable-ez-bar-curl",
    "kind": "related_variant",
    "checkedOn": "2026-11-03",
    "source": {
      "label": "Gold’s Gym British Columbia",
      "title": "4 Day Machine Focused",
      "url": "https://goldsgymbc.ca/wp-content/uploads/2023/09/GGBC-4-Day-Machine-Focused.pdf"
    },
    "sources": [
      {
        "label": "Gold’s Gym British Columbia",
        "title": "4 Day Machine Focused",
        "url": "https://goldsgymbc.ca/wp-content/uploads/2023/09/GGBC-4-Day-Machine-Focused.pdf"
      },
      {
        "label": "American Council on Exercise",
        "title": "Standing Bicep Curl",
        "url": "https://www.acefitness.org/resources/everyone/exercise-library/322/standing-bicep-curl/"
      }
    ],
    "scope": "Cable Bicep Curl 與 Cable Rope Hammer Curl 的低滑輪設定、握法、屈肘與回程。沒有明述 EZ 桿；不移植該課表的組數。 實際器材是腳踩彈力帶，並非滑輪或 EZ 桿；只能參考屈肘原則。",
    "checkedParts": [
      "相關變式的動作原則"
    ],
    "gaps": [
      "EZ 握角、腕部朝向與相容動畫仍需個別檢查。"
    ],
    "cues": [
      "可參考低滑輪彎舉；來源沒有 EZ 桿的個別握位設定。",
      "參考屈肘原則，不宣稱換 EZ 桿就換了主要肌群。",
      "控制回程。"
    ],
    "animation": {
      "status": "not-reviewed",
      "notes": "本次閱讀公開教學與比對程式；未逐格驗收這個動作的完整動畫。"
    },
    "professionalSignoff": false,
    "sourceTargets": {
      "role": "動作目標；未由 EZ 專項資料驗證",
      "primary": [
        "肘屈肌群"
      ]
    }
  },
  {
    "id": "cable-v-bar-row",
    "kind": "related_variant",
    "checkedOn": "2026-11-03",
    "source": {
      "label": "National Academy of Sports Medicine",
      "title": "Seated Machine Row Close Grip",
      "url": "https://www.nasm.org/resource-center/exercise-library/seated-machine-row-close-grip"
    },
    "sources": [
      {
        "label": "National Academy of Sports Medicine",
        "title": "Seated Machine Row Close Grip",
        "url": "https://www.nasm.org/resource-center/exercise-library/seated-machine-row-close-grip"
      }
    ],
    "scope": "坐姿、腳踩平台的窄握器械划船；與遊戲站姿 V 把不同。",
    "checkedParts": [
      "相關變式的動作原則"
    ],
    "gaps": [
      "不可把坐姿支撐方式當成站姿已驗證。"
    ],
    "cues": [
      "來源是坐姿器械、腳踩平台；遊戲是站姿 V 把。",
      "可參考肩胛後收、手肘向後與軀幹穩定。",
      "控制放回，避免突然被重量拉走。"
    ],
    "animation": {
      "status": "not-reviewed",
      "notes": "本次閱讀公開教學與比對程式；未逐格驗收這個動作的完整動畫。"
    },
    "professionalSignoff": false,
    "sourceTargets": {
      "role": "來源坐姿版本的出力肌群",
      "primary": [
        "闊背肌",
        "菱形肌"
      ],
      "secondary": [
        "中斜方肌",
        "三角肌後束",
        "肱二頭肌"
      ]
    }
  },
  {
    "id": "cable-rope-face-pull",
    "kind": "direct_instruction",
    "checkedOn": "2026-11-03",
    "source": {
      "label": "National Academy of Sports Medicine",
      "title": "Face Pull",
      "url": "https://www.nasm.org/resource-center/exercise-library/face-pull"
    },
    "sources": [
      {
        "label": "National Academy of Sports Medicine",
        "title": "Face Pull",
        "url": "https://www.nasm.org/resource-center/exercise-library/face-pull"
      }
    ],
    "scope": "約眼睛高度的繩索面拉、站位與回程，以及主要／次要肌群。",
    "checkedParts": [
      "起始設定",
      "主要動作",
      "控制回程"
    ],
    "gaps": [
      "遊戲滑輪高度應隨人物及設定對照，不把單一高度當通用值。"
    ],
    "cues": [
      "繩索設在約眼睛高度，往後站到纜線繃緊，膝蓋放鬆、軀幹站穩。",
      "把繩索拉向臉部兩側，手肘往後帶。",
      "慢慢伸回手臂。"
    ],
    "animation": {
      "status": "not-reviewed",
      "notes": "本次閱讀公開教學與比對程式；未逐格驗收這個動作的完整動畫。"
    },
    "professionalSignoff": false,
    "sourceTargets": {
      "role": "主要／次要出力",
      "primary": [
        "三角肌後束",
        "菱形肌"
      ],
      "secondary": [
        "中斜方肌",
        "棘下肌",
        "肱二頭肌"
      ]
    }
  },
  {
    "id": "cable-single-arm-lateral-raise",
    "kind": "related_variant",
    "checkedOn": "2026-11-03",
    "source": {
      "label": "American Council on Exercise",
      "title": "Single-arm Lateral Raise",
      "url": "https://www.acefitness.org/resources/everyone/exercise-library/354/single-arm-lateral-raise/"
    },
    "sources": [
      {
        "label": "American Council on Exercise",
        "title": "Single-arm Lateral Raise",
        "url": "https://www.acefitness.org/resources/everyone/exercise-library/354/single-arm-lateral-raise/"
      }
    ],
    "scope": "腰高滑輪、側向站位的側平舉；遊戲使用低滑輪，應標成高度變化版本。",
    "checkedParts": [
      "相關變式的動作原則"
    ],
    "gaps": [
      "不能用腰高來源認定低滑輪設定完全相同。",
      "不強迫每位玩家抬到固定角度。"
    ],
    "cues": [
      "來源把滑輪設在腰高；遊戲是低滑輪版本，已標明高度變化。",
      "身體站穩，手臂從身側抬開。",
      "停住後慢慢降回。"
    ],
    "animation": {
      "status": "not-reviewed",
      "notes": "本次閱讀公開教學與比對程式；未逐格驗收這個動作的完整動畫。"
    },
    "professionalSignoff": false,
    "sourceTargets": {
      "role": "主要出力",
      "primary": [
        "肩部肌群"
      ]
    }
  },
  {
    "id": "cable-ankle-kickback",
    "kind": "direct_instruction",
    "checkedOn": "2026-11-03",
    "source": {
      "label": "American Council on Exercise",
      "title": "8 Butt-toning Moves",
      "url": "https://www.acefitness.org/resources/pros/expert-articles/6355/8-butt-toning-moves/"
    },
    "sources": [
      {
        "label": "American Council on Exercise",
        "title": "8 Butt-toning Moves",
        "url": "https://www.acefitness.org/resources/pros/expert-articles/6355/8-butt-toning-moves/"
      }
    ],
    "scope": "低滑輪腳踝帶、扶穩支架、向後伸髖、控制回程；說明臀大肌。",
    "checkedParts": [
      "起始設定",
      "主要動作",
      "控制回程"
    ],
    "gaps": [
      "來源軀幹直立；遊戲略前傾屬姿勢變化，未逐幀驗證。"
    ],
    "cues": [
      "腳踝帶接低滑輪，面向器材，手扶穩固支架。",
      "從髖部把腿往後帶，軀幹保持穩定。",
      "控制腳回到起點。"
    ],
    "animation": {
      "status": "not-reviewed",
      "notes": "本次閱讀公開教學與比對程式；未逐格驗收這個動作的完整動畫。"
    },
    "professionalSignoff": false,
    "sourceTargets": {
      "role": "主要出力",
      "primary": [
        "臀大肌"
      ]
    }
  },
  {
    "id": "cable-rope-hammer-curl",
    "kind": "direct_instruction",
    "checkedOn": "2026-11-03",
    "source": {
      "label": "Gold’s Gym British Columbia",
      "title": "4 Day Machine Focused",
      "url": "https://goldsgymbc.ca/wp-content/uploads/2023/09/GGBC-4-Day-Machine-Focused.pdf"
    },
    "sources": [
      {
        "label": "Gold’s Gym British Columbia",
        "title": "4 Day Machine Focused",
        "url": "https://goldsgymbc.ca/wp-content/uploads/2023/09/GGBC-4-Day-Machine-Focused.pdf"
      }
    ],
    "scope": "Cable Bicep Curl 與 Cable Rope Hammer Curl 的低滑輪設定、握法、屈肘與回程。沒有明述 EZ 桿；不移植該課表的組數。",
    "checkedParts": [
      "起始設定",
      "主要動作",
      "控制回程"
    ],
    "gaps": [
      "繩索握法不代表一定改成完全不同的主要肌群。"
    ],
    "cues": [
      "繩索接低滑輪，掌心相對、上臂靠身側。",
      "手肘彎曲把繩索拉起，上臂不前後擺。",
      "慢慢伸回。"
    ],
    "animation": {
      "status": "not-reviewed",
      "notes": "本次閱讀公開教學與比對程式；未逐格驗收這個動作的完整動畫。"
    },
    "professionalSignoff": false,
    "sourceTargets": {
      "role": "動作目標；來源未逐項區分肘屈肌",
      "primary": [
        "肘屈肌群"
      ]
    }
  },
  {
    "id": "cable-straight-arm-pulldown",
    "kind": "direct_instruction",
    "checkedOn": "2026-11-03",
    "source": {
      "label": "Catalyst Athletics",
      "title": "Straight-Arm Pulldown",
      "url": "https://www.catalystathletics.com/exercise/907/Straight-Arm-Pulldown/"
    },
    "sources": [
      {
        "label": "Catalyst Athletics",
        "title": "Straight-Arm Pulldown",
        "url": "https://www.catalystathletics.com/exercise/907/Straight-Arm-Pulldown/"
      }
    ],
    "scope": "直桿、手臂伸長、軀幹穩定的肩關節下拉；不能用明顯屈肘取代。",
    "checkedParts": [
      "起始設定",
      "主要動作",
      "控制回程"
    ],
    "gaps": [
      "不要把動作做成明顯屈肘的下拉。",
      "遊戲的小幅固定屈肘目標是模型設計值，不是人體通用角度處方。",
      "保留原本 0.83～2.51 弧度的保守肩部展示行程，沒有宣稱涵蓋來源動作的完整端點或每個人的完整行程。",
      "遊戲展示行程仍依既定站位配置，不是個人化活動範圍。"
    ],
    "cues": [
      "面向高滑輪、握直桿，軀幹穩定，手臂伸長。",
      "維持手肘角度，從肩關節把直桿往身前下方帶。",
      "控制直桿回到前上方。"
    ],
    "animation": {
      "status": "corrected-checked",
      "notes": "已依真實骨長重算路徑，手肘改為接近伸直的小幅彎曲；通過實際模型與握把接觸檢查，未當成真人教練簽核。"
    },
    "professionalSignoff": false,
    "sourceTargets": {
      "role": "主要出力",
      "primary": [
        "闊背肌"
      ]
    }
  },
  {
    "id": "cable-rope-crunch",
    "kind": "direct_instruction",
    "checkedOn": "2026-11-03",
    "source": {
      "label": "American Council on Exercise",
      "title": "Standing Crunch",
      "url": "https://www.acefitness.org/resources/everyone/exercise-library/331/standing-crunch/"
    },
    "sources": [
      {
        "label": "American Council on Exercise",
        "title": "Standing Crunch",
        "url": "https://www.acefitness.org/resources/everyone/exercise-library/331/standing-crunch/"
      }
    ],
    "scope": "背向高滑輪、繩索靠耳，胸廓向下捲而非只折髖。",
    "checkedParts": [
      "起始設定",
      "主要動作",
      "控制回程"
    ],
    "gaps": [
      "不要只用髖部折身代替捲腹。"
    ],
    "cues": [
      "背向高滑輪、繩索放在耳朵兩側，雙腳約髖寬。",
      "腹部收緊，把胸廓往下捲。",
      "控制回到站穩姿勢。"
    ],
    "animation": {
      "status": "not-reviewed",
      "notes": "本次閱讀公開教學與比對程式；未逐格驗收這個動作的完整動畫。"
    },
    "professionalSignoff": false,
    "sourceTargets": {
      "role": "主要出力",
      "primary": [
        "腹部肌群"
      ]
    }
  },
  {
    "id": "machine-chest-press",
    "kind": "direct_instruction",
    "checkedOn": "2026-11-03",
    "source": {
      "label": "Life Fitness · SS-CP p16",
      "title": "Life Fitness Insignia Series Owner's Manual — 9481201 Rev BE",
      "url": "https://kb.cybexintl.com/Owners_Manuals/Strength/Life_Fitness_Insignia_Series_Owners_Manual_9481201_Rev_BE.pdf"
    },
    "sources": [
      {
        "label": "Life Fitness · SS-CP p16",
        "title": "Life Fitness Insignia Series Owner's Manual — 9481201 Rev BE",
        "url": "https://kb.cybexintl.com/Owners_Manuals/Strength/Life_Fitness_Insignia_Series_Owners_Manual_9481201_Rev_BE.pdf"
      }
    ],
    "scope": "坐姿配重胸推的相關機型；遊戲非品牌精確複製品。",
    "checkedParts": [
      "起始設定",
      "主要動作",
      "控制回程"
    ],
    "gaps": [
      "離開程序尚未涵蓋"
    ],
    "cues": [
      "握把齊胸中段；背部靠穩；慢推慢回。"
    ],
    "animation": {
      "status": "not-reviewed",
      "notes": "本次閱讀公開教學與比對程式；未逐格驗收這個動作的完整動畫。"
    },
    "professionalSignoff": false,
    "sourceTargets": [
      "胸大肌",
      "三角肌前束",
      "肱三頭肌"
    ],
    "findings": []
  },
  {
    "id": "machine-lat-pulldown",
    "kind": "direct_instruction",
    "checkedOn": "2026-11-03",
    "source": {
      "label": "Life Fitness · SS-PD p29",
      "title": "Life Fitness Insignia Series Owner's Manual — 9481201 Rev BE",
      "url": "https://kb.cybexintl.com/Owners_Manuals/Strength/Life_Fitness_Insignia_Series_Owners_Manual_9481201_Rev_BE.pdf"
    },
    "sources": [
      {
        "label": "Life Fitness · SS-PD p29",
        "title": "Life Fitness Insignia Series Owner's Manual — 9481201 Rev BE",
        "url": "https://kb.cybexintl.com/Owners_Manuals/Strength/Life_Fitness_Insignia_Series_Owners_Manual_9481201_Rev_BE.pdf"
      }
    ],
    "scope": "有大腿固定墊的高位下拉；不把此機型軀幹傾角泛用於所有下拉機。",
    "checkedParts": [
      "起始設定",
      "主要動作",
      "控制回程"
    ],
    "gaps": [
      "離開程序尚未涵蓋"
    ],
    "cues": [
      "先握把再入座；大腿固定；控制回程。"
    ],
    "animation": {
      "status": "not-reviewed",
      "notes": "本次閱讀公開教學與比對程式；未逐格驗收這個動作的完整動畫。"
    },
    "professionalSignoff": false,
    "sourceTargets": [
      "背闊肌",
      "肱二頭肌"
    ],
    "findings": []
  },
  {
    "id": "machine-seated-row",
    "kind": "related_variant",
    "checkedOn": "2026-11-03",
    "source": {
      "label": "Life Fitness · SS-RW p31",
      "title": "Life Fitness Insignia Series Owner's Manual — 9481201 Rev BE",
      "url": "https://kb.cybexintl.com/Owners_Manuals/Strength/Life_Fitness_Insignia_Series_Owners_Manual_9481201_Rev_BE.pdf"
    },
    "sources": [
      {
        "label": "Life Fitness · SS-RW p31",
        "title": "Life Fitness Insignia Series Owner's Manual — 9481201 Rev BE",
        "url": "https://kb.cybexintl.com/Owners_Manuals/Strength/Life_Fitness_Insignia_Series_Owners_Manual_9481201_Rev_BE.pdf"
      }
    ],
    "scope": "SS-RW 有胸靠；遊戲是無胸靠滑輪划船，只能核對腳部支撐與控制拉回原則。",
    "checkedParts": [
      "主要動作",
      "控制回程"
    ],
    "gaps": [
      "起始設定僅部分參考",
      "離開程序尚未涵蓋"
    ],
    "cues": [
      "雙腳支撐；軀幹穩定；控制拉回。"
    ],
    "animation": {
      "status": "not-reviewed",
      "notes": "本次閱讀公開教學與比對程式；未逐格驗收這個動作的完整動畫。"
    },
    "professionalSignoff": false,
    "sourceTargets": [
      "背闊肌",
      "菱形肌",
      "斜方肌",
      "大小圓肌",
      "三角肌後束",
      "肱二頭肌"
    ],
    "findings": []
  },
  {
    "id": "machine-leg-press",
    "kind": "equipment_only",
    "checkedOn": "2026-11-03",
    "source": {
      "label": "Life Fitness",
      "title": "Life Fitness Plate Loaded Linear Leg Press — SPLLLP",
      "url": "https://www.lifefitness.com/en-us/catalog/strength-training/plate-loaded/life-fitness-linear-leg-press"
    },
    "sources": [
      {
        "label": "Life Fitness",
        "title": "Life Fitness Plate Loaded Linear Leg Press — SPLLLP",
        "url": "https://www.lifefitness.com/en-us/catalog/strength-training/plate-loaded/life-fitness-linear-leg-press"
      }
    ],
    "scope": "遊戲為槓片斜軌雪橇；排除非雪橇式 PL-LP 手冊流程。",
    "checkedParts": [],
    "gaps": [
      "起始設定尚未涵蓋",
      "主要動作尚未涵蓋",
      "控制回程尚未涵蓋",
      "離開程序尚未涵蓋"
    ],
    "cues": [],
    "animation": {
      "status": "needs-work",
      "notes": "目前退場未示範斜軌雪橇的安全停靠扣件；這段仍須補機構與操作，不當成完整上下機教學。"
    },
    "professionalSignoff": false,
    "sourceTargets": [],
    "findings": [
      {
        "id": "legpress-parking",
        "severity": "needs-motion-correction",
        "files": [
          "src/equipment.js:164",
          "src/machine-lifecycle.js:204"
        ],
        "finding": "遊戲沿斜軌移動槓片雪橇，退場直接抬腳離開踏板。未在此分支看到停靠扣件或腳離板前的停靠操作。",
        "action": "先選定相符機型，補實際停靠幾何／狀態；確認雪橇由安全裝置承重後，才移腳放手。",
        "limits": "此為程式讀查，沒有宣稱畫面已碰撞或人體工學通過。"
      }
    ]
  },
  {
    "id": "machine-leg-extension",
    "kind": "direct_instruction",
    "checkedOn": "2026-11-03",
    "source": {
      "label": "Life Fitness · SS-LE p27",
      "title": "Life Fitness Insignia Series Owner's Manual — 9481201 Rev BE",
      "url": "https://kb.cybexintl.com/Owners_Manuals/Strength/Life_Fitness_Insignia_Series_Owners_Manual_9481201_Rev_BE.pdf"
    },
    "sources": [
      {
        "label": "Life Fitness · SS-LE p27",
        "title": "Life Fitness Insignia Series Owner's Manual — 9481201 Rev BE",
        "url": "https://kb.cybexintl.com/Owners_Manuals/Strength/Life_Fitness_Insignia_Series_Owners_Manual_9481201_Rev_BE.pdf"
      }
    ],
    "scope": "坐姿腿伸展的相關機型。",
    "checkedParts": [
      "起始設定",
      "主要動作",
      "控制回程"
    ],
    "gaps": [
      "離開程序尚未涵蓋"
    ],
    "cues": [
      "膝蓋對轉軸；滾墊在踝上；慢回。"
    ],
    "animation": {
      "status": "not-reviewed",
      "notes": "本次閱讀公開教學與比對程式；未逐格驗收這個動作的完整動畫。"
    },
    "professionalSignoff": false,
    "sourceTargets": [
      "股四頭肌"
    ],
    "findings": []
  },
  {
    "id": "machine-shoulder-press",
    "kind": "direct_instruction",
    "checkedOn": "2026-11-03",
    "source": {
      "label": "Life Fitness · SS-SP p33",
      "title": "Life Fitness Insignia Series Owner's Manual — 9481201 Rev BE",
      "url": "https://kb.cybexintl.com/Owners_Manuals/Strength/Life_Fitness_Insignia_Series_Owners_Manual_9481201_Rev_BE.pdf"
    },
    "sources": [
      {
        "label": "Life Fitness · SS-SP p33",
        "title": "Life Fitness Insignia Series Owner's Manual — 9481201 Rev BE",
        "url": "https://kb.cybexintl.com/Owners_Manuals/Strength/Life_Fitness_Insignia_Series_Owners_Manual_9481201_Rev_BE.pdf"
      }
    ],
    "scope": "坐姿肩推的相關機型。",
    "checkedParts": [
      "起始設定",
      "主要動作",
      "控制回程"
    ],
    "gaps": [
      "離開程序尚未涵蓋"
    ],
    "cues": [
      "握把齊肩或稍高；背靠墊；慢回。"
    ],
    "animation": {
      "status": "not-reviewed",
      "notes": "本次閱讀公開教學與比對程式；未逐格驗收這個動作的完整動畫。"
    },
    "professionalSignoff": false,
    "sourceTargets": [
      "三角肌",
      "肱三頭肌"
    ],
    "findings": []
  },
  {
    "id": "machine-cable-fly",
    "kind": "direct_instruction",
    "checkedOn": "2026-11-03",
    "source": {
      "label": "American Council on Exercise",
      "title": "Standing Chest Fly",
      "url": "https://www.acefitness.org/resources/everyone/exercise-library/160/standing-chest-fly/"
    },
    "sources": [
      {
        "label": "American Council on Exercise",
        "title": "Standing Chest Fly",
        "url": "https://www.acefitness.org/resources/everyone/exercise-library/160/standing-chest-fly/"
      }
    ],
    "scope": "雙側略高於肩的滑輪夾胸、D 把、固定小幅屈肘與控制回程。",
    "checkedParts": [
      "起始設定",
      "主要動作",
      "控制回程"
    ],
    "gaps": [
      "來源不包含遊戲架上取放與離開路徑。"
    ],
    "cues": [
      "雙側滑輪略高於肩，拿 D 把往前站穩。",
      "手肘保持小幅彎曲，雙手在身前靠近。",
      "控制張開，維持相近的手肘彎度。"
    ],
    "animation": {
      "status": "not-reviewed",
      "notes": "本次閱讀公開教學與比對程式；未逐格驗收這個動作的完整動畫。"
    },
    "professionalSignoff": false,
    "sourceTargets": {
      "role": "主要出力",
      "primary": [
        "胸部肌群"
      ]
    }
  },
  {
    "id": "machine-squat-rack",
    "kind": "direct_instruction",
    "checkedOn": "2026-11-03",
    "source": {
      "label": "American Council on Exercise",
      "title": "Back Squat",
      "url": "https://www.acefitness.org/resources/everyone/exercise-library/11/back-squat/"
    },
    "sources": [
      {
        "label": "American Council on Exercise",
        "title": "Back Squat",
        "url": "https://www.acefitness.org/resources/everyone/exercise-library/11/back-squat/"
      }
    ],
    "scope": "自由槓背蹲，槓會隨身體移動；不是固定導軌。",
    "checkedParts": [
      "起始設定",
      "主要動作",
      "控制回程"
    ],
    "gaps": [
      "公開來源涵蓋握持、上背承槓、出槓與退步；完整回架離槓需結合程式驗收，來源不能替代。"
    ],
    "cues": [
      "調整槓高與安全桿，握穩並讓上背承槓；伸腿出槓後小步退到站位。",
      "屈髖屈膝，腳掌穩定，下降到能維持姿勢的範圍。",
      "雙腳推地站回；結束時靠近掛鉤並確認槓已受支撐再鬆手。"
    ],
    "animation": {
      "status": "not-reviewed",
      "notes": "本次閱讀公開教學與比對程式；未逐格驗收這個動作的完整動畫。"
    },
    "professionalSignoff": false,
    "findings": [
      {
        "file": "src/data.js",
        "line": 190,
        "status": "consistent",
        "detail": "說明含安全桿、上背承槓與可控制的蹲深，引用為相同自由槓動作。"
      },
      {
        "file": "src/barbell-lifecycle-paths.js",
        "line": 65,
        "status": "consistent-at-code-level",
        "detail": "先閉握、再低頭移到槓下、上背承槓與伸腿；第 81 行只讓自由槓退步，順序與來源概述相符。"
      },
      {
        "file": "src/barbell-lifecycle-paths.js",
        "line": 37,
        "status": "bounded-demonstration-range",
        "detail": "蹲深與軀幹角由固定參數產生；不能稱已依不同體型完成個別化校正。"
      },
      {
        "file": "src/barbell-lifecycle-paths.js",
        "line": 116,
        "status": "review-limit",
        "detail": "退出沿已編排節點反向回架並標示確認承重後放手；此次沒有重做支撐接觸或逐格碰撞驗收。"
      }
    ],
    "sourceTargets": {
      "primary": [
        "股四頭肌",
        "臀大肌"
      ],
      "secondary": [
        "軀幹與背部穩定肌群"
      ]
    }
  },
  {
    "id": "machine-bench-press",
    "kind": "direct_instruction",
    "checkedOn": "2026-11-03",
    "source": {
      "label": "National Academy of Sports Medicine",
      "title": "Barbell Bench Press",
      "url": "https://www.nasm.org/resource-center/exercise-library/barbell-bench-press"
    },
    "sources": [
      {
        "label": "National Academy of Sports Medicine",
        "title": "Barbell Bench Press",
        "url": "https://www.nasm.org/resource-center/exercise-library/barbell-bench-press"
      }
    ],
    "scope": "自由槓平板臥推，不是史密斯或固定軌道胸推。",
    "checkedParts": [
      "起始設定",
      "主要動作",
      "控制回程"
    ],
    "gaps": [
      "來源有平躺與主動作，未完整涵蓋出槓、回架確認、坐起及離椅。"
    ],
    "cues": [
      "雙腳踩穩、肩部與臀部有支撐，設定安全桿或安排保護者，再握穩準備出槓。",
      "在能控制的範圍受控下放與推起，不快速落槓或反彈。",
      "先把槓送回掛鉤並確認受支撐，再鬆手坐起離椅。"
    ],
    "animation": {
      "status": "not-reviewed",
      "notes": "本次閱讀公開教學與比對程式；未逐格驗收這個動作的完整動畫。"
    },
    "professionalSignoff": false,
    "findings": [
      {
        "file": "src/data.js",
        "line": 216,
        "status": "consistent-with-principles",
        "detail": "已有安全桿／保護者、支撐點、受控槓路與回架確認；NASM 主動作來源本身不包含所有安全過場。"
      },
      {
        "file": "src/barbell-lifecycle-paths.js",
        "line": 127,
        "status": "source-gap",
        "detail": "程式先把槓移到固定回架點再安排鬆手，來源未提供精確回架路徑；這一段需另找直接教學並重做接觸驗收。"
      },
      {
        "file": "src/barbell-lifecycle-paths.js",
        "line": 129,
        "status": "independent-exit-sequence",
        "detail": "回架後另排坐起、站立與離開，並非持槓直接坐起；仍不表示已通過真人負重自然度審查。"
      }
    ],
    "sourceTargets": {
      "primary": [
        "胸大肌"
      ],
      "secondary": [
        "肱三頭肌",
        "前三角肌",
        "軀幹穩定肌群"
      ]
    }
  },
  {
    "id": "machine-treadmill",
    "kind": "partial_instruction",
    "checkedOn": "2026-11-03",
    "source": {
      "label": "Life Fitness",
      "title": "Life Fitness Atmos Treadmill — How to Use Your SL Console Guided Tour",
      "url": "https://support.lifefitness.com/hc/en-us/articles/42814152246039-Life-Fitness-Atmos-Treadmill-How-to-Use-Your-SL-Console-Guided-Tour"
    },
    "sources": [
      {
        "label": "Life Fitness",
        "title": "Life Fitness Atmos Treadmill — How to Use Your SL Console Guided Tour",
        "url": "https://support.lifefitness.com/hc/en-us/articles/42814152246039-Life-Fitness-Atmos-Treadmill-How-to-Use-Your-SL-Console-Guided-Tour"
      }
    ],
    "scope": "只核對 Atmos SL 控制台啟停；不代表遊戲跑步步態與上下機已核對。",
    "checkedParts": [],
    "gaps": [
      "起始設定僅部分參考",
      "主要動作尚未涵蓋",
      "控制回程尚未涵蓋",
      "離開程序僅部分參考"
    ],
    "cues": [
      "GO 開始；STOP 暫停，再按結束；COOL DOWN 進入緩和。"
    ],
    "animation": {
      "status": "not-reviewed",
      "notes": "本次閱讀公開教學與比對程式；未逐格驗收這個動作的完整動畫。"
    },
    "professionalSignoff": false,
    "sourceTargets": [],
    "findings": [
      {
        "id": "treadmill-source-scope",
        "severity": "source-scope-overclaim",
        "files": [
          "src/data.js"
        ],
        "finding": "來源是 Atmos SL 控制台導覽，現有標籤卻涵蓋啟停與安全；未讀到安全夾或上下跑帶教學。",
        "action": "縮小標籤為控制台啟停參考，補正確操作手冊前維持其餘待核對。"
      }
    ]
  },
  {
    "id": "machine-bike",
    "kind": "partial_instruction",
    "checkedOn": "2026-11-03",
    "source": {
      "label": "Concept2",
      "title": "Concept2 Setting Up the BikeErg",
      "url": "https://www.concept2.com/training/articles/setting-up-the-bikeerg"
    },
    "sources": [
      {
        "label": "Concept2",
        "title": "Concept2 Setting Up the BikeErg",
        "url": "https://www.concept2.com/training/articles/setting-up-the-bikeerg"
      }
    ],
    "scope": "只核對 BikeErg 座墊設定；不同健身車的停踏與緊急煞車須按機型說明。",
    "checkedParts": [
      "起始設定"
    ],
    "gaps": [
      "主要動作僅部分參考",
      "控制回程尚未涵蓋",
      "離開程序尚未涵蓋"
    ],
    "cues": [
      "以前腳掌騎乘時，踏板最低處的膝蓋仍微彎。"
    ],
    "animation": {
      "status": "not-reviewed",
      "notes": "本次閱讀公開教學與比對程式；未逐格驗收這個動作的完整動畫。"
    },
    "professionalSignoff": false,
    "sourceTargets": [],
    "findings": []
  },
  {
    "id": "machine-plate-incline-press",
    "kind": "direct_instruction",
    "checkedOn": "2026-11-03",
    "source": {
      "label": "Life Fitness / Hammer Strength · 2.9／2.10 IL-IPH／IL-IPV",
      "title": "Hammer Strength Iso-Lateral Owner's Manual — 1000419-0001 AC",
      "url": "https://resources.lifefitness.com/hub/life-fitness/en-US/1000419-0001-xd_32ce9968be620066-6b5ac64-1817a3e5ec1--7f3d.ditamap?onepage=true"
    },
    "sources": [
      {
        "label": "Life Fitness / Hammer Strength · 2.9／2.10 IL-IPH／IL-IPV",
        "title": "Hammer Strength Iso-Lateral Owner's Manual — 1000419-0001 AC",
        "url": "https://resources.lifefitness.com/hub/life-fitness/en-US/1000419-0001-xd_32ce9968be620066-6b5ac64-1817a3e5ec1--7f3d.ditamap?onepage=true"
      }
    ],
    "scope": "分離式上斜胸推的相關機型。",
    "checkedParts": [
      "起始設定",
      "主要動作",
      "控制回程"
    ],
    "gaps": [
      "離開程序尚未涵蓋"
    ],
    "cues": [
      "握把齊胸中段或稍高；背靠穩；慢回。"
    ],
    "animation": {
      "status": "not-reviewed",
      "notes": "本次閱讀公開教學與比對程式；未逐格驗收這個動作的完整動畫。"
    },
    "professionalSignoff": false,
    "sourceTargets": [
      "胸大肌",
      "三角肌前束",
      "肱三頭肌"
    ],
    "findings": []
  },
  {
    "id": "machine-plate-high-row",
    "kind": "direct_instruction",
    "checkedOn": "2026-11-03",
    "source": {
      "label": "Life Fitness / Hammer Strength · 2.7 IL-HR",
      "title": "Hammer Strength Iso-Lateral Owner's Manual — 1000419-0001 AC",
      "url": "https://resources.lifefitness.com/hub/life-fitness/en-US/1000419-0001-xd_32ce9968be620066-6b5ac64-1817a3e5ec1--7f3d.ditamap?onepage=true"
    },
    "sources": [
      {
        "label": "Life Fitness / Hammer Strength · 2.7 IL-HR",
        "title": "Hammer Strength Iso-Lateral Owner's Manual — 1000419-0001 AC",
        "url": "https://resources.lifefitness.com/hub/life-fitness/en-US/1000419-0001-xd_32ce9968be620066-6b5ac64-1817a3e5ec1--7f3d.ditamap?onepage=true"
      },
      {
        "label": "Life Fitness · 2.7 IL-HR",
        "title": "Life Fitness Plate Loaded High Row",
        "url": "https://www.lifefitness.com/en-gb/catalog/strength-training/plate-loaded/life-fitness-high-row"
      }
    ],
    "scope": "已讀 IL-HR 高位划船的設定與拉回原則；遊戲機臂為簡化版本，沒有胸墊，文字依現有大腿墊與坐姿修正。",
    "checkedParts": [
      "起始設定",
      "主要動作",
      "控制回程"
    ],
    "gaps": [
      "離開程序尚未涵蓋"
    ],
    "cues": [
      "握把後入座；大腿固定；肘向後下拉，慢回。"
    ],
    "animation": {
      "status": "not-reviewed",
      "notes": "本次閱讀公開教學與比對程式；未逐格驗收這個動作的完整動畫。"
    },
    "professionalSignoff": false,
    "sourceTargets": [
      "背闊肌",
      "菱形肌",
      "三角肌後束",
      "斜方肌",
      "大小圓肌",
      "肱二頭肌"
    ],
    "findings": [
      {
        "id": "highrow-chestpad-copy",
        "severity": "copy-geometry-mismatch",
        "files": [
          "src/data.js",
          "src/equipment.js:143"
        ],
        "finding": "plateHighRow 的現有步驟要求胸部貼胸墊；此幾何只有座椅及大腿滾墊，沒有胸墊。",
        "action": "依大腿固定機型修改文字並核對手握、入座順序。"
      }
    ]
  },
  {
    "id": "machine-plate-shoulder-press",
    "kind": "direct_instruction",
    "checkedOn": "2026-11-03",
    "source": {
      "label": "Life Fitness / Hammer Strength · 2.17 IL-SP",
      "title": "Hammer Strength Iso-Lateral Owner's Manual — 1000419-0001 AC",
      "url": "https://resources.lifefitness.com/hub/life-fitness/en-US/1000419-0001-xd_32ce9968be620066-6b5ac64-1817a3e5ec1--7f3d.ditamap?onepage=true"
    },
    "sources": [
      {
        "label": "Life Fitness / Hammer Strength · 2.17 IL-SP",
        "title": "Hammer Strength Iso-Lateral Owner's Manual — 1000419-0001 AC",
        "url": "https://resources.lifefitness.com/hub/life-fitness/en-US/1000419-0001-xd_32ce9968be620066-6b5ac64-1817a3e5ec1--7f3d.ditamap?onepage=true"
      }
    ],
    "scope": "槓片肩推的相關機型。",
    "checkedParts": [
      "起始設定",
      "主要動作",
      "控制回程"
    ],
    "gaps": [
      "離開程序尚未涵蓋"
    ],
    "cues": [
      "握把齊肩或稍高；肩背靠墊；慢回。"
    ],
    "animation": {
      "status": "not-reviewed",
      "notes": "本次閱讀公開教學與比對程式；未逐格驗收這個動作的完整動畫。"
    },
    "professionalSignoff": false,
    "sourceTargets": [
      "三角肌",
      "肱三頭肌"
    ],
    "findings": []
  },
  {
    "id": "machine-hack-squat",
    "kind": "direct_instruction",
    "checkedOn": "2026-11-03",
    "source": {
      "label": "Life Fitness / Hammer Strength · PL-HSQ p45",
      "title": "Hammer Strength Plate Loaded Owner's Manual — 1000420-0001 Rev AG",
      "url": "https://kb.cybexintl.com/Owners_Manuals/Strength/OM_Hammer_Strength_Plate_Loaded_Owners_Manual_1000420-0001.pdf"
    },
    "sources": [
      {
        "label": "Life Fitness / Hammer Strength · PL-HSQ p45",
        "title": "Hammer Strength Plate Loaded Owner's Manual — 1000420-0001 Rev AG",
        "url": "https://kb.cybexintl.com/Owners_Manuals/Strength/OM_Hammer_Strength_Plate_Loaded_Owners_Manual_1000420-0001.pdf"
      }
    ],
    "scope": "具機械停靠把手的哈克機；遊戲須另核對實際支撐裝置。",
    "checkedParts": [
      "起始設定",
      "主要動作",
      "控制回程",
      "離開程序"
    ],
    "gaps": [],
    "cues": [
      "先設定限位；近伸直再解扣；退場前停回擋座。"
    ],
    "animation": {
      "status": "not-reviewed",
      "notes": "本次閱讀公開教學與比對程式；未逐格驗收這個動作的完整動畫。"
    },
    "professionalSignoff": false,
    "sourceTargets": [
      "股四頭肌",
      "臀肌",
      "髖外展肌",
      "髖內收肌"
    ],
    "findings": []
  },
  {
    "id": "machine-hip-thrust",
    "kind": "related_variant",
    "checkedOn": "2026-11-03",
    "source": {
      "label": "Life Fitness / Hammer Strength · PL-GLD p41",
      "title": "Hammer Strength Plate Loaded Owner's Manual — 1000420-0001 Rev AG",
      "url": "https://kb.cybexintl.com/Owners_Manuals/Strength/OM_Hammer_Strength_Plate_Loaded_Owners_Manual_1000420-0001.pdf"
    },
    "sources": [
      {
        "label": "Life Fitness / Hammer Strength · PL-GLD p41",
        "title": "Hammer Strength Plate Loaded Owner's Manual — 1000420-0001 Rev AG",
        "url": "https://kb.cybexintl.com/Owners_Manuals/Strength/OM_Hammer_Strength_Plate_Loaded_Owners_Manual_1000420-0001.pdf"
      }
    ],
    "scope": "PL-GLD 是腰帶式；遊戲為壓墊機臂，固定與放開流程不可視為同款。",
    "checkedParts": [
      "主要動作",
      "控制回程"
    ],
    "gaps": [
      "起始設定僅部分參考",
      "離開程序尚未涵蓋"
    ],
    "cues": [
      "背靠穩、腰帶固定；髖推起後慢降。"
    ],
    "animation": {
      "status": "not-reviewed",
      "notes": "本次閱讀公開教學與比對程式；未逐格驗收這個動作的完整動畫。"
    },
    "professionalSignoff": false,
    "sourceTargets": [
      "臀肌",
      "股四頭肌"
    ],
    "findings": [
      {
        "id": "hipthrust-variant",
        "severity": "related-variant-only",
        "files": [
          "src/equipment.js:218"
        ],
        "finding": "遊戲為可翻壓墊機臂，PL-GLD 來源為腰帶錨點固定；來源列臀肌與股四頭肌，未建立現有腿後肌群／軀幹的主輔排名。",
        "action": "標示機型差異；不能據腰帶手冊宣稱壓墊固定或放開動作已驗收。"
      }
    ]
  },
  {
    "id": "machine-calf-raise",
    "kind": "direct_instruction",
    "checkedOn": "2026-11-03",
    "source": {
      "label": "Life Fitness / Hammer Strength · PL-CALF p52",
      "title": "Hammer Strength Plate Loaded Owner's Manual — 1000420-0001 Rev AG",
      "url": "https://kb.cybexintl.com/Owners_Manuals/Strength/OM_Hammer_Strength_Plate_Loaded_Owners_Manual_1000420-0001.pdf"
    },
    "sources": [
      {
        "label": "Life Fitness / Hammer Strength · PL-CALF p52",
        "title": "Hammer Strength Plate Loaded Owner's Manual — 1000420-0001 Rev AG",
        "url": "https://kb.cybexintl.com/Owners_Manuals/Strength/OM_Hammer_Strength_Plate_Loaded_Owners_Manual_1000420-0001.pdf"
      }
    ],
    "scope": "有停靠支撐的坐姿提踵；遊戲支撐移動仍須另驗。",
    "checkedParts": [
      "起始設定",
      "主要動作",
      "控制回程",
      "離開程序"
    ],
    "gaps": [],
    "cues": [
      "前掌踩穩；提踵清空擋座；扣回支撐再離開。"
    ],
    "animation": {
      "status": "not-reviewed",
      "notes": "本次閱讀公開教學與比對程式；未逐格驗收這個動作的完整動畫。"
    },
    "professionalSignoff": false,
    "sourceTargets": [
      "比目魚肌"
    ],
    "findings": []
  },
  {
    "id": "machine-smith-squat",
    "kind": "related_variant",
    "checkedOn": "2026-11-03",
    "source": {
      "label": "Cybex / Life Fitness",
      "title": "Ion Series Smith Rack: Assembly Instructions",
      "url": "https://kb.cybexintl.com/Assembly_Manuals/Strength/Cybex_ION_AI_CI-SM_Smith_Rack_1015904-0001.pdf"
    },
    "sources": [
      {
        "label": "Cybex / Life Fitness",
        "title": "Ion Series Smith Rack: Assembly Instructions",
        "url": "https://kb.cybexintl.com/Assembly_Manuals/Strength/Cybex_ION_AI_CI-SM_Smith_Rack_1015904-0001.pdf"
      },
      {
        "label": "Hammer Strength / Life Fitness",
        "title": "Plate-Loaded Vertical Smith Machine",
        "url": "https://www.lifefitness.com/en-gb/catalog/strength-training/plate-loaded/plate-loaded-vertical-smith-machine"
      }
    ],
    "scope": "固定垂直導軌。Cybex 手冊不能當作遊戲 Hammer Strength 造型的完整型號教學。",
    "checkedParts": [
      "起始設定",
      "主要動作",
      "控制回程"
    ],
    "gaps": [
      "手冊涵蓋安全止擋、解鎖與回掛確認；跨型號引用只提供安全原則，未完成目前模型的原廠全流程認證。"
    ],
    "cues": [
      "先設槓高與安全止擋，握穩、上背承槓後抬槓並依該機型轉動解鎖。",
      "沿導軌受控屈髖屈膝，腳位依機型與自身比例調整。",
      "站回後轉回掛鉤，確認掛妥承重才放手離開。"
    ],
    "animation": {
      "status": "not-reviewed",
      "notes": "本次閱讀公開教學與比對程式；未逐格驗收這個動作的完整動畫。"
    },
    "professionalSignoff": false,
    "findings": [
      {
        "file": "src/data.js",
        "line": 436,
        "status": "insufficient-as-only-teaching-source",
        "detail": "目前只連產品規格，能證實垂直槓路，不能支撐完整深蹲流程；建議補原廠操作手冊並標註型號差異。"
      },
      {
        "file": "src/barbell-lifecycle-paths.js",
        "line": 42,
        "status": "consistent-at-code-level",
        "detail": "Smith 槓的前後座標固定，與垂直導軌概念相符；未檢驗最終身體各部位的所有接觸。"
      },
      {
        "file": "src/barbell-lifecycle-paths.js",
        "line": 80,
        "status": "consistent-at-code-level",
        "detail": "有抬槓後轉動解鎖，且不做自由槓的退步；固定 -.45 旋轉是模型設定，不是通用實機規格。"
      },
      {
        "file": "src/barbell-lifecycle-paths.js",
        "line": 116,
        "status": "partial-source-coverage",
        "detail": "反向流程包含轉回並放到承重銷後放手，與手冊原則相符；仍需模型接觸與慢放驗收。"
      }
    ],
    "sourceTargets": {
      "primary": [
        "股四頭肌",
        "臀大肌"
      ],
      "secondary": [
        "軀幹穩定肌群"
      ]
    }
  },
  {
    "id": "machine-leg-curl",
    "kind": "direct_instruction",
    "checkedOn": "2026-11-03",
    "source": {
      "label": "Life Fitness · SS-SLC p32",
      "title": "Life Fitness Insignia Series Owner's Manual — 9481201 Rev BE",
      "url": "https://kb.cybexintl.com/Owners_Manuals/Strength/Life_Fitness_Insignia_Series_Owners_Manual_9481201_Rev_BE.pdf"
    },
    "sources": [
      {
        "label": "Life Fitness · SS-SLC p32",
        "title": "Life Fitness Insignia Series Owner's Manual — 9481201 Rev BE",
        "url": "https://kb.cybexintl.com/Owners_Manuals/Strength/Life_Fitness_Insignia_Series_Owners_Manual_9481201_Rev_BE.pdf"
      }
    ],
    "scope": "使用坐姿 SS-SLC；排除趴姿 SS-LC。遊戲握把位置不同。",
    "checkedParts": [
      "起始設定",
      "主要動作",
      "控制回程",
      "離開程序"
    ],
    "gaps": [],
    "cues": [
      "膝對轉軸；固定大腿；彎腿慢回，抬墊再離開。"
    ],
    "animation": {
      "status": "not-reviewed",
      "notes": "本次閱讀公開教學與比對程式；未逐格驗收這個動作的完整動畫。"
    },
    "professionalSignoff": false,
    "sourceTargets": [
      "腿後肌群"
    ],
    "findings": []
  },
  {
    "id": "machine-pec-deck",
    "kind": "direct_instruction",
    "checkedOn": "2026-11-03",
    "source": {
      "label": "Life Fitness · SS-FLY p28：Pectoral Fly",
      "title": "Life Fitness Insignia Series Owner's Manual — 9481201 Rev BE",
      "url": "https://kb.cybexintl.com/Owners_Manuals/Strength/Life_Fitness_Insignia_Series_Owners_Manual_9481201_Rev_BE.pdf"
    },
    "sources": [
      {
        "label": "Life Fitness · SS-FLY p28：Pectoral Fly",
        "title": "Life Fitness Insignia Series Owner's Manual — 9481201 Rev BE",
        "url": "https://kb.cybexintl.com/Owners_Manuals/Strength/Life_Fitness_Insignia_Series_Owners_Manual_9481201_Rev_BE.pdf"
      }
    ],
    "scope": "直握把夾胸變式。",
    "checkedParts": [
      "起始設定",
      "主要動作",
      "控制回程"
    ],
    "gaps": [
      "離開程序尚未涵蓋"
    ],
    "cues": [
      "直握把；肘微彎且略低於肩；控制回程。"
    ],
    "animation": {
      "status": "not-reviewed",
      "notes": "本次閱讀公開教學與比對程式；未逐格驗收這個動作的完整動畫。"
    },
    "professionalSignoff": false,
    "sourceTargets": [
      "胸大肌",
      "三角肌前束"
    ],
    "findings": []
  },
  {
    "id": "machine-lateral-raise",
    "kind": "direct_instruction",
    "checkedOn": "2026-11-03",
    "source": {
      "label": "Life Fitness · SS-LR p25",
      "title": "Life Fitness Insignia Series Owner's Manual — 9481201 Rev BE",
      "url": "https://kb.cybexintl.com/Owners_Manuals/Strength/Life_Fitness_Insignia_Series_Owners_Manual_9481201_Rev_BE.pdf"
    },
    "sources": [
      {
        "label": "Life Fitness · SS-LR p25",
        "title": "Life Fitness Insignia Series Owner's Manual — 9481201 Rev BE",
        "url": "https://kb.cybexintl.com/Owners_Manuals/Strength/Life_Fitness_Insignia_Series_Owners_Manual_9481201_Rev_BE.pdf"
      }
    ],
    "scope": "以手臂墊承托的側平舉機。",
    "checkedParts": [
      "起始設定",
      "主要動作",
      "控制回程"
    ],
    "gaps": [
      "離開程序尚未涵蓋"
    ],
    "cues": [
      "肩對轉軸；前臂靠墊；肘到肩高再慢降。"
    ],
    "animation": {
      "status": "not-reviewed",
      "notes": "本次閱讀公開教學與比對程式；未逐格驗收這個動作的完整動畫。"
    },
    "professionalSignoff": false,
    "sourceTargets": [
      "三角肌"
    ],
    "findings": []
  },
  {
    "id": "machine-elliptical",
    "kind": "direct_instruction",
    "checkedOn": "2026-11-03",
    "source": {
      "label": "Life Fitness · 印刷 p10",
      "title": "Integrity+ and Club Series+ Cross-Trainer — 1023156-0001",
      "url": "https://kb.cybexintl.com/Assembly_Manuals/Cross_Trainer/Integrity_Plus/1023156-0001_ENGLISH.pdf"
    },
    "sources": [
      {
        "label": "Life Fitness · 印刷 p10",
        "title": "Integrity+ and Club Series+ Cross-Trainer — 1023156-0001",
        "url": "https://kb.cybexintl.com/Assembly_Manuals/Cross_Trainer/Integrity_Plus/1023156-0001_ENGLISH.pdf"
      }
    ],
    "scope": "Integrity+ 橢圓機上下機與扶手教學。",
    "checkedParts": [
      "起始設定",
      "主要動作",
      "離開程序"
    ],
    "gaps": [
      "控制回程僅部分參考"
    ],
    "cues": [
      "先把靠近自己的踏板降到最低，握固定扶手跨上。",
      "下機腳的踏板先歸最低；握固定扶手跨下，落地才放手。"
    ],
    "animation": {
      "status": "needs-work",
      "notes": "目前缺固定扶手，退場過早放手；尚未符合所讀手冊的扶握跨下順序。"
    },
    "professionalSignoff": false,
    "sourceTargets": [],
    "findings": [
      {
        "id": "elliptical-release-order",
        "severity": "needs-motion-correction",
        "files": [
          "src/cardio-lifecycle-paths.js:28"
        ],
        "finding": "退場分支先轉成 freeHands 再跨下踏板，沒有保留固定扶手支撐。equipment.js 的橢圓機只有活動臂、活動握把及控制台立柱，沒有建模固定扶手或提供固定握點 API。",
        "action": "先補真實固定扶手與接觸 API，再維持扶手接觸下機；腳下踏板歸最低，雙腳落地後再放手。不可只改標籤或把手指向未建模的空中位置。",
        "implementationStatus": "尚未修改：只調整路徑無法滿足真實固定扶手接觸，也沒有以假握點繞過既有手腳誤差門檻。"
      }
    ]
  },
  {
    "id": "machine-rower",
    "kind": "direct_instruction",
    "checkedOn": "2026-11-03",
    "source": {
      "label": "Concept2",
      "title": "Concept2 Rowing Technique",
      "url": "https://www.concept2.com/training/rowing-technique"
    },
    "sources": [
      {
        "label": "Concept2",
        "title": "Concept2 Rowing Technique",
        "url": "https://www.concept2.com/training/rowing-technique"
      }
    ],
    "scope": "Concept2 划船技術；不包含遊戲腳帶及上下機機構驗收。",
    "checkedParts": [
      "主要動作",
      "控制回程"
    ],
    "gaps": [
      "起始設定僅部分參考",
      "離開程序尚未涵蓋"
    ],
    "cues": [
      "推進依序是腿、軀幹、手；回程是手、軀幹、腿。",
      "手先過膝再彎膝；手腕平直、肩膀放鬆。"
    ],
    "animation": {
      "status": "not-reviewed",
      "notes": "本次閱讀公開教學與比對程式；未逐格驗收這個動作的完整動畫。"
    },
    "professionalSignoff": false,
    "sourceTargets": [],
    "findings": []
  },
  {
    "id": "machine-stair-climber",
    "kind": "equipment_only",
    "checkedOn": "2026-11-03",
    "source": {
      "label": "Life Fitness",
      "title": "Life Fitness PowerMill Climber",
      "url": "https://www.lifefitness.com/en-us/catalog/cardio/stair-climbers-stepper-machines/powermill-climber"
    },
    "sources": [
      {
        "label": "Life Fitness",
        "title": "Life Fitness PowerMill Climber",
        "url": "https://www.lifefitness.com/en-us/catalog/cardio/stair-climbers-stepper-machines/powermill-climber"
      }
    ],
    "scope": "目前只有產品結構與停機功能；操作手冊網址本次無法讀取。",
    "checkedParts": [],
    "gaps": [
      "起始設定尚未涵蓋",
      "主要動作尚未涵蓋",
      "控制回程尚未涵蓋",
      "離開程序尚未涵蓋"
    ],
    "cues": [],
    "animation": {
      "status": "not-reviewed",
      "notes": "本次閱讀公開教學與比對程式；未逐格驗收這個動作的完整動畫。"
    },
    "professionalSignoff": false,
    "sourceTargets": [],
    "findings": []
  },
  {
    "id": "machine-assisted-pullup",
    "kind": "direct_instruction",
    "checkedOn": "2026-11-03",
    "source": {
      "label": "Life Fitness · SS-ADC p11：Assist Chin",
      "title": "Life Fitness Insignia Series Owner's Manual — 9481201 Rev BE",
      "url": "https://kb.cybexintl.com/Owners_Manuals/Strength/Life_Fitness_Insignia_Series_Owners_Manual_9481201_Rev_BE.pdf"
    },
    "sources": [
      {
        "label": "Life Fitness · SS-ADC p11：Assist Chin",
        "title": "Life Fitness Insignia Series Owner's Manual — 9481201 Rev BE",
        "url": "https://kb.cybexintl.com/Owners_Manuals/Strength/Life_Fitness_Insignia_Series_Owners_Manual_9481201_Rev_BE.pdf"
      }
    ],
    "scope": "膝墊輔助機；配重增加代表輔助增加。",
    "checkedParts": [
      "起始設定",
      "主要動作",
      "控制回程",
      "離開程序"
    ],
    "gaps": [],
    "cues": [
      "握穩再跪墊；退場先讓膝墊升頂，再倒退下階。"
    ],
    "animation": {
      "status": "not-reviewed",
      "notes": "本次閱讀公開教學與比對程式；未逐格驗收這個動作的完整動畫。"
    },
    "professionalSignoff": false,
    "sourceTargets": [
      "背闊肌",
      "肱二頭肌"
    ],
    "findings": []
  },
  {
    "id": "machine-assisted-dip",
    "kind": "direct_instruction",
    "checkedOn": "2026-11-03",
    "source": {
      "label": "Life Fitness · SS-ADC p11：Assist Dip",
      "title": "Life Fitness Insignia Series Owner's Manual — 9481201 Rev BE",
      "url": "https://kb.cybexintl.com/Owners_Manuals/Strength/Life_Fitness_Insignia_Series_Owners_Manual_9481201_Rev_BE.pdf"
    },
    "sources": [
      {
        "label": "Life Fitness · SS-ADC p11：Assist Dip",
        "title": "Life Fitness Insignia Series Owner's Manual — 9481201 Rev BE",
        "url": "https://kb.cybexintl.com/Owners_Manuals/Strength/Life_Fitness_Insignia_Series_Owners_Manual_9481201_Rev_BE.pdf"
      }
    ],
    "scope": "膝墊輔助雙槓機；非坐姿下壓機。",
    "checkedParts": [
      "起始設定",
      "主要動作",
      "控制回程",
      "離開程序"
    ],
    "gaps": [],
    "cues": [
      "軀幹直、下降可控；膝墊升頂再倒退下階。"
    ],
    "animation": {
      "status": "not-reviewed",
      "notes": "本次閱讀公開教學與比對程式；未逐格驗收這個動作的完整動畫。"
    },
    "professionalSignoff": false,
    "sourceTargets": [
      "肱三頭肌",
      "三角肌前束",
      "胸大肌"
    ],
    "findings": []
  },
  {
    "id": "machine-hip-abduction",
    "kind": "direct_instruction",
    "checkedOn": "2026-11-03",
    "source": {
      "label": "Life Fitness · SS-HAB p23",
      "title": "Life Fitness Insignia Series Owner's Manual — 9481201 Rev BE",
      "url": "https://kb.cybexintl.com/Owners_Manuals/Strength/Life_Fitness_Insignia_Series_Owners_Manual_9481201_Rev_BE.pdf"
    },
    "sources": [
      {
        "label": "Life Fitness · SS-HAB p23",
        "title": "Life Fitness Insignia Series Owner's Manual — 9481201 Rev BE",
        "url": "https://kb.cybexintl.com/Owners_Manuals/Strength/Life_Fitness_Insignia_Series_Owners_Manual_9481201_Rev_BE.pdf"
      }
    ],
    "scope": "坐姿髖外展的相關機型。",
    "checkedParts": [
      "起始設定",
      "主要動作",
      "控制回程",
      "離開程序"
    ],
    "gaps": [],
    "cues": [
      "膝推墊外開、慢回；退場先釋放壓墊。"
    ],
    "animation": {
      "status": "not-reviewed",
      "notes": "本次閱讀公開教學與比對程式；未逐格驗收這個動作的完整動畫。"
    },
    "professionalSignoff": false,
    "sourceTargets": [
      "髖外展肌群"
    ],
    "findings": []
  },
  {
    "id": "machine-hip-adduction",
    "kind": "direct_instruction",
    "checkedOn": "2026-11-03",
    "source": {
      "label": "Life Fitness · SS-HAD p24",
      "title": "Life Fitness Insignia Series Owner's Manual — 9481201 Rev BE",
      "url": "https://kb.cybexintl.com/Owners_Manuals/Strength/Life_Fitness_Insignia_Series_Owners_Manual_9481201_Rev_BE.pdf"
    },
    "sources": [
      {
        "label": "Life Fitness · SS-HAD p24",
        "title": "Life Fitness Insignia Series Owner's Manual — 9481201 Rev BE",
        "url": "https://kb.cybexintl.com/Owners_Manuals/Strength/Life_Fitness_Insignia_Series_Owners_Manual_9481201_Rev_BE.pdf"
      }
    ],
    "scope": "坐姿髖內收的相關機型。",
    "checkedParts": [
      "起始設定",
      "主要動作",
      "控制回程",
      "離開程序"
    ],
    "gaps": [],
    "cues": [
      "膝推墊內收、慢回；退場先釋放壓墊。"
    ],
    "animation": {
      "status": "not-reviewed",
      "notes": "本次閱讀公開教學與比對程式；未逐格驗收這個動作的完整動畫。"
    },
    "professionalSignoff": false,
    "sourceTargets": [
      "髖內收肌群"
    ],
    "findings": []
  },
  {
    "id": "machine-back-extension",
    "kind": "equipment_only",
    "checkedOn": "2026-11-03",
    "source": {
      "label": "Life Fitness",
      "title": "Life Fitness Signature Back Extension Bench — LBR-BE",
      "url": "https://shop.lifefitness.com/products/signature-series-back-extension"
    },
    "sources": [
      {
        "label": "Life Fitness",
        "title": "Life Fitness Signature Back Extension Bench — LBR-BE",
        "url": "https://shop.lifefitness.com/products/signature-series-back-extension"
      }
    ],
    "scope": "45° 背伸展椅；不可套用坐姿 SS-BE 的壓背操作。",
    "checkedParts": [],
    "gaps": [
      "起始設定尚未涵蓋",
      "主要動作尚未涵蓋",
      "控制回程尚未涵蓋",
      "離開程序尚未涵蓋"
    ],
    "cues": [],
    "animation": {
      "status": "not-reviewed",
      "notes": "本次閱讀公開教學與比對程式；未逐格驗收這個動作的完整動畫。"
    },
    "professionalSignoff": false,
    "sourceTargets": [],
    "findings": []
  },
  {
    "id": "machine-preacher-curl",
    "kind": "direct_instruction",
    "checkedOn": "2026-11-03",
    "source": {
      "label": "Life Fitness / Hammer Strength · PL-BI p51",
      "title": "Hammer Strength Plate Loaded Owner's Manual — 1000420-0001 Rev AG",
      "url": "https://kb.cybexintl.com/Owners_Manuals/Strength/OM_Hammer_Strength_Plate_Loaded_Owners_Manual_1000420-0001.pdf"
    },
    "sources": [
      {
        "label": "Life Fitness / Hammer Strength · PL-BI p51",
        "title": "Hammer Strength Plate Loaded Owner's Manual — 1000420-0001 Rev AG",
        "url": "https://kb.cybexintl.com/Owners_Manuals/Strength/OM_Hammer_Strength_Plate_Loaded_Owners_Manual_1000420-0001.pdf"
      }
    ],
    "scope": "槓片式坐姿彎舉，較原配重式 Insignia 引用接近遊戲。",
    "checkedParts": [
      "起始設定",
      "主要動作",
      "控制回程"
    ],
    "gaps": [
      "離開程序尚未涵蓋"
    ],
    "cues": [
      "腋下靠近墊頂；肘對轉軸；上臂留墊、慢回。"
    ],
    "animation": {
      "status": "not-reviewed",
      "notes": "本次閱讀公開教學與比對程式；未逐格驗收這個動作的完整動畫。"
    },
    "professionalSignoff": false,
    "sourceTargets": [
      "肱二頭肌"
    ],
    "findings": []
  },
  {
    "id": "machine-lying-chest-press",
    "kind": "direct_instruction",
    "checkedOn": "2026-11-03",
    "source": {
      "label": "Life Fitness / Hammer Strength · 2.8 IL-HBP",
      "title": "Hammer Strength Iso-Lateral Owner's Manual — 1000419-0001 AC",
      "url": "https://resources.lifefitness.com/hub/life-fitness/en-US/1000419-0001-xd_32ce9968be620066-6b5ac64-1817a3e5ec1--7f3d.ditamap?onepage=true"
    },
    "sources": [
      {
        "label": "Life Fitness / Hammer Strength · 2.8 IL-HBP",
        "title": "Hammer Strength Iso-Lateral Owner's Manual — 1000419-0001 AC",
        "url": "https://resources.lifefitness.com/hub/life-fitness/en-US/1000419-0001-xd_32ce9968be620066-6b5ac64-1817a3e5ec1--7f3d.ditamap?onepage=true"
      },
      {
        "label": "Life Fitness / Hammer Strength · 2.8 IL-HBP",
        "title": "Hammer Strength Iso-Lateral Horizontal Bench Press — IL-HBP",
        "url": "https://www.lifefitness.com/en-gb/catalog/strength-training/plate-loaded/plate-loaded-iso-lateral-horizontal-bench-press"
      }
    ],
    "scope": "水平躺姿胸推；原連結的直立 Bench Press 機型不符。",
    "checkedParts": [
      "起始設定",
      "主要動作",
      "控制回程"
    ],
    "gaps": [
      "離開程序尚未涵蓋"
    ],
    "cues": [
      "肩、頭靠墊；肘略低於肩；控制推回。"
    ],
    "animation": {
      "status": "not-reviewed",
      "notes": "本次閱讀公開教學與比對程式；未逐格驗收這個動作的完整動畫。"
    },
    "professionalSignoff": false,
    "sourceTargets": [
      "胸大肌",
      "肱三頭肌",
      "三角肌前束"
    ],
    "findings": [
      {
        "id": "horizontal-source-mismatch",
        "severity": "source-model-mismatch",
        "files": [
          "src/additional-equipment-data.js",
          "src/additional-equipment.js:147"
        ],
        "finding": "平躺機原來源為 upright Iso-Lateral Bench Press。",
        "action": "改連結 Horizontal Bench Press IL-HBP，引用手冊 2.8。"
      }
    ]
  },
  {
    "id": "machine-decline-chest-press",
    "kind": "related_variant",
    "checkedOn": "2026-11-03",
    "source": {
      "label": "Life Fitness / Hammer Strength · 2.4 IL-DCP（坐姿相關變式）",
      "title": "Hammer Strength Iso-Lateral Owner's Manual — 1000419-0001 AC",
      "url": "https://resources.lifefitness.com/hub/life-fitness/en-US/1000419-0001-xd_32ce9968be620066-6b5ac64-1817a3e5ec1--7f3d.ditamap?onepage=true"
    },
    "sources": [
      {
        "label": "Life Fitness / Hammer Strength · 2.4 IL-DCP（坐姿相關變式）",
        "title": "Hammer Strength Iso-Lateral Owner's Manual — 1000419-0001 AC",
        "url": "https://resources.lifefitness.com/hub/life-fitness/en-US/1000419-0001-xd_32ce9968be620066-6b5ac64-1817a3e5ec1--7f3d.ditamap?onepage=true"
      }
    ],
    "scope": "讀到的 IL-DCP 教學是坐姿安全帶機；遊戲是下斜躺椅，不能視為相同入位與固定程序。",
    "checkedParts": [],
    "gaps": [
      "起始設定尚未涵蓋",
      "主要動作僅部分參考",
      "控制回程僅部分參考",
      "離開程序尚未涵蓋",
      "來源是坐姿機；未涵蓋遊戲躺式下斜機的固定與進出。"
    ],
    "cues": [],
    "animation": {
      "status": "not-reviewed",
      "notes": "本次閱讀公開教學與比對程式；未逐格驗收這個動作的完整動畫。"
    },
    "professionalSignoff": false,
    "sourceTargets": [
      "胸大肌",
      "肱三頭肌",
      "三角肌前束"
    ],
    "findings": [
      {
        "id": "decline-model-mismatch",
        "severity": "source-model-mismatch",
        "files": [
          "src/additional-equipment.js:147",
          "src/additional-equipment-data.js"
        ],
        "finding": "遊戲下斜長椅與來源坐姿 IL-DCP 的座高、背靠和安全帶結構不同。",
        "action": "保留相關變式標記，取得躺姿下斜機的實際說明後才核對全流程。"
      }
    ]
  },
  {
    "id": "machine-reverse-fly",
    "kind": "direct_instruction",
    "checkedOn": "2026-11-03",
    "source": {
      "label": "Life Fitness · SS-FLY p28：Rear Deltoid",
      "title": "Life Fitness Insignia Series Owner's Manual — 9481201 Rev BE",
      "url": "https://kb.cybexintl.com/Owners_Manuals/Strength/Life_Fitness_Insignia_Series_Owners_Manual_9481201_Rev_BE.pdf"
    },
    "sources": [
      {
        "label": "Life Fitness · SS-FLY p28：Rear Deltoid",
        "title": "Life Fitness Insignia Series Owner's Manual — 9481201 Rev BE",
        "url": "https://kb.cybexintl.com/Owners_Manuals/Strength/Life_Fitness_Insignia_Series_Owners_Manual_9481201_Rev_BE.pdf"
      },
      {
        "label": "Matrix / Johnson Health Tech · SS-FLY p28：Rear Deltoid",
        "title": "Matrix Ultra 蝴蝶機及後三角訓練機 G7-S22-AS2007",
        "url": "https://images-direct.jhtassets.com/bcffcda4f10cb26cbe70fe30908df1431ee6e478/original/named/UltraPecFlyRearDelt%2BIntelligentTrainingItc20%2B66306%2B85967%2Bzht%2Btw%2B.pdf"
      }
    ],
    "scope": "操作依據改採 Life Fitness 雙功能機；Matrix PDF 僅能作產品參考。",
    "checkedParts": [
      "起始設定",
      "主要動作",
      "控制回程"
    ],
    "gaps": [
      "離開程序尚未涵蓋"
    ],
    "cues": [
      "面向胸墊、握內側橫把；手臂齊平、肘微彎。"
    ],
    "animation": {
      "status": "not-reviewed",
      "notes": "本次閱讀公開教學與比對程式；未逐格驗收這個動作的完整動畫。"
    },
    "professionalSignoff": false,
    "sourceTargets": [
      "三角肌後束",
      "斜方肌"
    ],
    "findings": [
      {
        "id": "reversefly-brochure-label",
        "severity": "source-scope-overclaim",
        "files": [
          "src/additional-equipment-data.js"
        ],
        "finding": "Matrix 兩頁產品規格被標成使用說明。",
        "action": "改標產品型錄；操作另外引用已讀過的 SS-FLY 後三角章節。"
      }
    ]
  },
  {
    "id": "group-class",
    "kind": "course_type",
    "checkedOn": "2026-11-03",
    "source": {
      "label": "World Gym Taiwan",
      "title": "World Gym 團體課程",
      "url": "https://www.worldgymtaiwan.com/aerobics-class"
    },
    "sources": [
      {
        "label": "World Gym Taiwan",
        "title": "World Gym 團體課程",
        "url": "https://www.worldgymtaiwan.com/aerobics-class"
      },
      {
        "label": "American Heart Association",
        "title": "Warm Up, Cool Down",
        "url": "https://www.heart.org/en/healthy-living/exercise-and-physical-activity/fitness-basics/warm-up-cool-down"
      }
    ],
    "scope": "課程分類目錄，沒有遊戲暖身課的逐動作教學。 起始逐漸加快、結束逐漸減速；伸展不彈震、不做到痛。不能據此驗證遊戲整套課程。",
    "checkedParts": [],
    "gaps": [
      "World Gym 目錄沒有遊戲每一段暖身動作；整堂課尚未逐動作查證。",
      "未逐段對照本遊戲整堂課、47 種課內動作與全部進出程序。"
    ],
    "cues": [
      "課程先從輕鬆的全身活動開始。",
      "AHA 支持逐漸加快與最後逐漸減速的原則。",
      "緩和時逐漸降速，伸展不彈震、不做到痛。"
    ],
    "animation": {
      "status": "not-reviewed",
      "notes": "課程形式或設備資料不代表整堂課已核對。"
    },
    "professionalSignoff": false,
    "sourceTargets": {
      "role": "整堂課逐動作未核對",
      "targets": []
    }
  },
  {
    "id": "class-dance",
    "kind": "course_type",
    "checkedOn": "2026-11-03",
    "source": {
      "label": "World Gym Taiwan",
      "title": "Dance Aerobics 有氧舞蹈",
      "url": "https://www.worldgymtaiwan.com/aerobics-class/cardio-sculpt/cardio-fat-burning/dance-aerobics"
    },
    "sources": [
      {
        "label": "World Gym Taiwan",
        "title": "Dance Aerobics 有氧舞蹈",
        "url": "https://www.worldgymtaiwan.com/aerobics-class/cardio-sculpt/cardio-fat-burning/dance-aerobics"
      }
    ],
    "scope": "舞蹈與音樂結合的課程類型；沒有遊戲編舞或每一段動作。",
    "checkedParts": [],
    "gaps": [
      "課型介紹不是完整課程教學或舞蹈編排授權。",
      "未逐段對照本遊戲整堂課、47 種課內動作與全部進出程序。"
    ],
    "cues": [
      "來源介紹音樂結合上下肢協調的舞蹈有氧。",
      "沒有來源可驗證遊戲整套編舞。",
      "未驗證各段換步與緩和。"
    ],
    "animation": {
      "status": "not-reviewed",
      "notes": "課程形式或設備資料不代表整堂課已核對。"
    },
    "professionalSignoff": false,
    "sourceTargets": {
      "role": "整堂課逐動作未核對",
      "targets": []
    }
  },
  {
    "id": "class-cycle",
    "kind": "course_type",
    "checkedOn": "2026-11-03",
    "source": {
      "label": "World Gym Taiwan",
      "title": "Indoor Cycling 飛輪課程",
      "url": "https://www.worldgymtaiwan.com/aerobics-class/indoor-cycling/indoor-cycling"
    },
    "sources": [
      {
        "label": "World Gym Taiwan",
        "title": "Indoor Cycling 飛輪課程",
        "url": "https://www.worldgymtaiwan.com/aerobics-class/indoor-cycling/indoor-cycling"
      }
    ],
    "scope": "飛輪課分類；不是座高、踩踏或完整課程教學。",
    "checkedParts": [],
    "gaps": [
      "不能把課程目錄視為騎乘姿勢已通過。",
      "未逐段對照本遊戲整堂課、47 種課內動作與全部進出程序。"
    ],
    "cues": [
      "目前來源只有飛輪課分類。",
      "未取得可核對遊戲座高、踩踏與站姿騎乘的逐項教學。",
      "未驗證上下車與整堂緩和。"
    ],
    "animation": {
      "status": "not-reviewed",
      "notes": "課程形式或設備資料不代表整堂課已核對。"
    },
    "professionalSignoff": false,
    "sourceTargets": {
      "role": "整堂課逐動作未核對",
      "targets": []
    }
  },
  {
    "id": "class-trx",
    "kind": "course_type",
    "checkedOn": "2026-11-03",
    "source": {
      "label": "TRX Training",
      "title": "The 7 Foundational Movements to Master",
      "url": "https://www.trxtraining.com/blogs/news/7-basic-movements"
    },
    "sources": [
      {
        "label": "TRX Training",
        "title": "The 7 Foundational Movements to Master",
        "url": "https://www.trxtraining.com/blogs/news/7-basic-movements"
      },
      {
        "label": "TRX Training",
        "title": "Quickstart Suspension Trainer",
        "url": "https://www.trxtraining.com/pages/quickstart-suspension-trainer"
      }
    ],
    "scope": "懸吊划船與深蹲的文字教學；只涵蓋課程的一小部分。 教學影片索引；未觀看嵌入影片，不能計為影片動作審查。",
    "checkedParts": [],
    "gaps": [
      "僅讀了 TRX 划船與深蹲文字；影片未觀看，其他動作與整堂課未核對。",
      "未逐段對照本遊戲整堂課、47 種課內動作與全部進出程序。"
    ],
    "cues": [
      "划船面向固定點、身體保持成一直線；深蹲雙腳站穩。",
      "划船把胸口拉向手；深蹲讓髖部往後下，再踩地站起。",
      "划船控制放回，維持軀幹穩定。"
    ],
    "animation": {
      "status": "not-reviewed",
      "notes": "課程形式或設備資料不代表整堂課已核對。"
    },
    "professionalSignoff": false,
    "sourceTargets": {
      "role": "只核對划船與深蹲原則；整堂未核對",
      "targets": []
    }
  },
  {
    "id": "class-barbell",
    "kind": "course_type",
    "checkedOn": "2026-11-03",
    "source": {
      "label": "Les Mills",
      "title": "BODYPUMP",
      "url": "https://www.lesmills.com/workouts/bodypump"
    },
    "sources": [
      {
        "label": "Les Mills",
        "title": "BODYPUMP",
        "url": "https://www.lesmills.com/workouts/bodypump"
      }
    ],
    "scope": "槓鈴肌力課型介紹；遊戲是原創課程，沒有取得 BODYPUMP 編排或音樂授權。",
    "checkedParts": [],
    "gaps": [
      "遊戲為原創內容，不宣稱為 BODYPUMP 官方課程。",
      "未逐段對照本遊戲整堂課、47 種課內動作與全部進出程序。"
    ],
    "cues": [
      "來源支持槓鈴肌力團課這個類型。",
      "不能用品牌課型頁驗證遊戲的每段硬舉、划船與深蹲。",
      "取放槓與換動作尚需個別教學對照。"
    ],
    "animation": {
      "status": "not-reviewed",
      "notes": "課程形式或設備資料不代表整堂課已核對。"
    },
    "professionalSignoff": false,
    "sourceTargets": {
      "role": "整堂課逐動作未核對",
      "targets": []
    }
  },
  {
    "id": "class-aerial",
    "kind": "equipment_only",
    "checkedOn": "2026-11-03",
    "source": {
      "label": "Aerial Essentials",
      "title": "Frequently Asked Questions",
      "url": "https://www.aerialessentials.com/pages/faq"
    },
    "sources": [
      {
        "label": "Aerial Essentials",
        "title": "Frequently Asked Questions",
        "url": "https://www.aerialessentials.com/pages/faq"
      }
    ],
    "scope": "布料與吊掛設備；不是上布、倒掛或離開的身體動作教學。",
    "checkedParts": [],
    "gaps": [
      "不可因設備 FAQ 而認定空中倒掛安全或通過審查。",
      "保留現有需現場合格指導的提示，且不把公開網頁當真人簽核。",
      "未逐段對照本遊戲整堂課、47 種課內動作與全部進出程序。"
    ],
    "cues": [
      "FAQ 只說明吊布、尺寸與吊掛方式。",
      "沒有核實倒掛、進布、纏繞及離開的身體教學。",
      "倒掛退出與落地流程尚未驗證。"
    ],
    "animation": {
      "status": "not-reviewed",
      "notes": "課程形式或設備資料不代表整堂課已核對。"
    },
    "professionalSignoff": false,
    "sourceTargets": {
      "role": "動作尚未查證",
      "targets": []
    }
  },
  {
    "id": "class-pilates",
    "kind": "course_type",
    "checkedOn": "2026-11-03",
    "source": {
      "label": "World Gym Taiwan",
      "title": "Pilates 皮拉提斯",
      "url": "https://www.worldgymtaiwan.com/aerobics-class/static-stretching/wellness-fitness/pilates"
    },
    "sources": [
      {
        "label": "World Gym Taiwan",
        "title": "Pilates 皮拉提斯",
        "url": "https://www.worldgymtaiwan.com/aerobics-class/static-stretching/wellness-fitness/pilates"
      },
      {
        "label": "Merrithew",
        "title": "STOTT PILATES: Five Basic Principles",
        "url": "https://www.merrithew.com/stott-pilates/warmup/en/principles/five-basic-principles"
      }
    ],
    "scope": "呼吸、控制與核心等課型原則，無完整動作編排。 列出呼吸、骨盆、胸廓、肩胛與頭頸五項基礎；未逐頁查閱各動作。",
    "checkedParts": [],
    "gaps": [
      "基礎原則與課型介紹不能代替完整的皮拉提斯動作審查。",
      "未逐段對照本遊戲整堂課、47 種課內動作與全部進出程序。"
    ],
    "cues": [
      "參考呼吸、骨盆、胸廓、肩胛與頭頸控制。",
      "目前僅核對原則目錄，未核對遊戲各段橋式與腿部動作。",
      "整堂的變換姿勢與緩和未逐段驗證。"
    ],
    "animation": {
      "status": "not-reviewed",
      "notes": "課程形式或設備資料不代表整堂課已核對。"
    },
    "professionalSignoff": false,
    "sourceTargets": {
      "role": "整堂課逐動作未核對",
      "targets": []
    }
  }
];
