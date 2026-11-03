"""Export optical lower-limb references from four actual SAME-Limb trials.

The source does not state global axes or length units. Coordinates below use
an explicitly derived anatomical rest frame and an ASIS/knee/ankle marker-path
length proxy. They are dimensionless and never labelled metres or hip centres.
"""
import argparse
import base64
import hashlib
import json
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
INPUT = ROOT / '.local-tools' / 'same-limb-v018'
COMMIT = '233b0db6cfda8360338f92219e07fd3d3d1d7bdb'
REPOSITORY = 'https://huggingface.co/datasets/Tdongxu/A_Synchronized_Lower_Limb_AMG_sEMG_and_Mocap'
TASKS = ('deadlift', 'deep_squat', 'heel_raise', 'stand_sit_transition')
MARKERS = ['L.Thigh', 'L.Knee', 'L.Shank', 'L.Ankle', 'L.Heel', 'L.Toe',
           'R.ASIS', 'L.ASIS', 'V.Sacral', 'R.Thigh', 'R.Knee', 'R.Shank',
           'R.Ankle', 'R.Heel', 'R.Toe']
ANGLES = ['right_knee_flexion', 'left_knee_flexion', 'right_ankle_angle', 'left_ankle_angle']
CHANNELS = ['rightKneeFlexionDeg', 'leftKneeFlexionDeg', 'rightAnkleMarkerAngleDeg', 'leftAnkleMarkerAngleDeg']
for stem in ['pelvisRelativeAnkles', 'leftThighDirection', 'rightThighDirection',
             'leftShinDirection', 'rightShinDirection', 'leftAnkleRelativeToe',
             'rightAnkleRelativeToe', 'pelvisRelativeToeMidpoint']:
    CHANNELS.extend(stem + axis for axis in 'XYZ')
STEPS = np.array([.01] * 4 + [.0001] * 24, dtype=np.float64)
SOURCE_LOAD = {
    'deadlift': 'Raised box containing two packs of 500 A4 sheets; source reports no mass in kg. Not barbell or dumbbell capture.',
    'deep_squat': 'Unweighted deep squat under the dataset protocol; not a loaded goblet/barbell squat capture.',
    'heel_raise': 'Standing bilateral heel raise; not seated machine calf-raise capture.',
    'stand_sit_transition': 'Ordinary-chair stand/sit transitions; not equipment-specific mounting or dismounting.',
}
ATTRIBUTION = ('SAME-Limb: Synchronized AMG and EMG Dataset of Lower-limb Muscle Activities in Everyday Training, '
               'Dongxu Tang, Shih Ying-Lei, Zhuoyi Ren, Jianting Liao, and Yitian Shao, '
               'https://doi.org/10.57967/hf/9950, licensed under CC BY 4.0, '
               'https://creativecommons.org/licenses/by/4.0/. Changes: selected optical marker/joint-angle channels; '
               'five-frame smoothing; anatomical-rest-frame and marker-path-length normalization; '
               'three complete repetition crops per trial; temporal resampling and quantization. '
               'No source EMG or AMG signal is used to drive the game muscle colours.')


def sha(data):
    return hashlib.sha256(data).hexdigest()


def unit(values):
    lengths = np.linalg.norm(values, axis=-1, keepdims=True)
    if not np.all(np.isfinite(lengths)) or np.min(lengths) < 1e-8:
        raise ValueError('Degenerate marker-defined direction')
    return values / lengths


def smooth(values, radius=2):
    padded = np.pad(values, [(radius, radius)] + [(0, 0)] * (values.ndim - 1), mode='edge')
    return sum(padded[offset:offset + len(values)] for offset in range(2 * radius + 1)) / (2 * radius + 1)


def marker_angles(markers):
    result = []
    for triplet, flexion in [((9, 10, 12), True), ((0, 1, 3), True),
                             ((11, 12, 14), False), ((2, 3, 5), False)]:
        before = unit(markers[:, triplet[0]] - markers[:, triplet[1]])
        after = unit(markers[:, triplet[2]] - markers[:, triplet[1]])
        degrees = np.degrees(np.arccos(np.clip(np.sum(before * after, axis=1), -1, 1)))
        result.append(180 - degrees if flexion else degrees)
    return np.stack(result, axis=1)


def load_trial(task):
    path = INPUT / (task + '-A1.npz')
    with np.load(path, allow_pickle=False) as archive:
        fields = ['motion_markers_named', 'motion_marker_names', 'motion_frame_number',
                  'joint_angles_deg', 'joint_angle_names', 'joint_angle_valid_mask',
                  'time_motion_s', 'metadata_json', 'content_sha256']
        arrays = {name: archive[name] for name in fields}
    validate_trial(task, arrays)
    return path, arrays


def validate_trial(task, arrays):
    m, t, angles, valid = (arrays[key] for key in ['motion_markers_named', 'time_motion_s', 'joint_angles_deg', 'joint_angle_valid_mask'])
    n = len(t)
    if n < 100 or m.shape != (n, 15, 3) or angles.shape != (n, 4) or valid.shape != (n, 4):
        raise ValueError('Unexpected optical motion/channel shape')
    if arrays['motion_marker_names'].tolist() != MARKERS or arrays['joint_angle_names'].tolist() != ANGLES:
        raise ValueError('Named markers/angles do not match the documented schema')
    if not np.isfinite(m).all() or not np.isfinite(angles).all() or not np.isfinite(t).all() or not valid.all():
        raise ValueError('Invalid or nonfinite optical marker/joint-angle frame; no fallback interpolation allowed')
    if not np.all(np.diff(t) > 0) or np.max(np.diff(t)) > .05:
        raise ValueError('Nonmonotonic or interrupted native motion time')
    if arrays['motion_frame_number'].shape != (n,) or not np.all(np.diff(arrays['motion_frame_number']) == 1):
        raise ValueError('Noncontiguous source motion frame identifiers')
    meta = json.loads(str(arrays['metadata_json']))
    if meta['sampling_rates_hz']['motion_capture_nominal'] != 90 or meta['condition_id'] != task:
        raise ValueError('Source task/fps metadata mismatch')
    if meta['joint_angles']['clinical_joint_coordinate_system'] or meta['joint_angles']['full_inverse_kinematics']:
        raise ValueError('Unexpected joint-angle definition')
    if np.max(np.abs(marker_angles(m.astype(np.float64)) - angles)) > .001:
        raise ValueError('Published angles do not reproduce from the named optical marker triplets')


def anatomy_frame(markers):
    rest = np.mean(markers[:60], axis=0)
    pelvis = np.mean(rest[[6, 7, 8]], axis=0)
    ankles = np.mean(rest[[3, 12]], axis=0)
    up = unit(pelvis - ankles)
    right = rest[6] - rest[7]
    right = unit(right - np.dot(right, up) * up)
    forward = np.mean(rest[[5, 14]] - rest[[4, 13]], axis=0)
    forward = unit(forward - np.dot(forward, up) * up - np.dot(forward, right) * right)
    basis = np.stack([right, up, forward], axis=1)
    proxy = np.mean([np.linalg.norm(rest[7] - rest[1]) + np.linalg.norm(rest[1] - rest[3]),
                     np.linalg.norm(rest[6] - rest[10]) + np.linalg.norm(rest[10] - rest[12])])
    if proxy <= 0 or np.max(np.abs(basis.T @ basis - np.eye(3))) > 1e-8:
        raise ValueError('Invalid derived anatomical normalization frame')
    return basis, float(proxy)


def trial_channels(arrays):
    raw = arrays['motion_markers_named'].astype(np.float64)
    basis, proxy = anatomy_frame(raw)
    markers = smooth(raw) @ basis
    angles = smooth(arrays['joint_angles_deg'].astype(np.float64))
    pelvis = np.mean(markers[:, [6, 7, 8]], axis=1)
    ankles = np.mean(markers[:, [3, 12]], axis=1)
    toes = np.mean(markers[:, [5, 14]], axis=1)
    channels = [angles, (pelvis - ankles) / proxy,
                unit(markers[:, 1] - markers[:, 0]), unit(markers[:, 10] - markers[:, 9]),
                unit(markers[:, 3] - markers[:, 1]), unit(markers[:, 12] - markers[:, 10]),
                (markers[:, 3] - markers[:, 5]) / proxy,
                (markers[:, 12] - markers[:, 14]) / proxy, (pelvis - toes) / proxy]
    return np.concatenate(channels, axis=1), basis, proxy


def raw_slice_sha(arrays, start, end):
    return sha(b''.join(np.asarray(arrays[key][start:end + 1], dtype=dtype).tobytes(order='C')
                        for key, dtype in [('motion_frame_number', '<i8'), ('time_motion_s', '<f8'),
                                           ('motion_markers_named', '<f4'), ('joint_angles_deg', '<f4'),
                                           ('joint_angle_valid_mask', '?')]))


def derive_effort(values, task):
    # This normalized timing curve is explicitly a derivative, not a raw angle.
    raw = np.mean(values[:, [20, 23]], axis=1) if task == 'heel_raise' else np.mean(values[:, :2], axis=1)
    residual = raw - np.linspace(raw[0], raw[-1], len(raw))
    if np.max(residual) < (.01 if task == 'heel_raise' else 15):
        raise ValueError('Crop lacks a complete matching captured repetition')
    progress = np.clip(residual / np.max(residual), 0, 1)
    peak = int(np.argmax(progress))
    progress[:peak + 1] = np.maximum.accumulate(progress[:peak + 1])
    progress[peak:] = np.maximum.accumulate(progress[peak:][::-1])[::-1]
    return np.round(progress, 7).tolist(), peak


def export():
    sources, clips, manifest_clips = [], [], []
    for task in TASKS:
        path, arrays = load_trial(task)
        times = arrays['time_motion_s']
        values, basis, proxy = trial_channels(arrays)
        source_id = 'same-limb-user01-' + task + '-A1'
        relative = 'data/trials/user01/functional_action/' + task + '/A1.npz'
        sources.append({'id': source_id, 'task': task, 'participant': 'user01', 'trial': 'A1',
                        'url': REPOSITORY + '/resolve/' + COMMIT + '/' + relative,
                        'rawSHA256': sha(path.read_bytes()), 'providerContentSHA256': str(arrays['content_sha256']),
                        'frames': len(times), 'nominalFPS': 90, 'actualDurationSeconds': float(times[-1] - times[0]),
                        'nativeIntervalSeconds': [float(np.min(np.diff(times))), float(np.max(np.diff(times)))],
                        'sourceLoad': SOURCE_LOAD[task], 'sourceUnit': 'source motion-capture coordinate unit; metric scale unspecified',
                        'coordinateFrame': {'kind': 'derived-initial-anatomical-frame-not-claimed-global-axes',
                                            'restFrames': [0, 59], 'rightUpForwardColumns': basis.tolist(),
                                            'determinant': float(np.linalg.det(basis)),
                                            'legProxyRawUnits': proxy,
                                            'legProxyDefinition': 'mean initial ASIS-to-knee plus knee-to-ankle marker-path length; not anatomical femur/tibia lengths'}})
        for repetition, (low, high) in enumerate([(2, 6), (6, 10), (10, float(times[-1]))]):
            start = int(np.searchsorted(times, low, side='left'))
            end = int(np.searchsorted(times, high, side='right') - 1)
            if start >= end or end >= len(times):
                raise ValueError('Invalid repetition crop')
            target = np.linspace(times[start], times[end], 121)
            sampled = np.stack([np.interp(target, times, values[:, i]) for i in range(len(CHANNELS))], axis=1)
            quantized = np.rint(sampled / STEPS)
            if not np.isfinite(quantized).all() or np.max(np.abs(quantized)) > 32767:
                raise ValueError('Int16 profile range exceeded')
            encoded = quantized.astype('<i2').tobytes(order='C')
            decoded = quantized * STEPS
            error = np.max(np.abs(decoded - sampled), axis=0)
            if not np.all(error <= STEPS / 2 + 1e-10):
                raise ValueError('Quantization error exceeded')
            effort, peak = derive_effort(sampled, task)
            record = {'id': 'same-' + task.replace('_', '-') + '-' + chr(97 + repetition),
                      'task': task, 'sourceId': source_id, 'sourceRepetition': repetition + 1,
                      'firstFrameIndex': start, 'lastFrameIndex': end,
                      'firstSourceFrame': int(arrays['motion_frame_number'][start]),
                      'lastSourceFrame': int(arrays['motion_frame_number'][end]),
                      'startSeconds': float(times[start]), 'endSeconds': float(times[end]),
                      'sourceDurationSeconds': float(times[end] - times[start]), 'nominalFPS': 90,
                      'sampleCount': 121, 'stride': len(CHANNELS), 'peakPhase': peak / 120,
                      'effortChannel': 'mean optical ankle-height-over-toe' if task == 'heel_raise' else 'mean marker-defined knee flexion',
                      'effortProgress': effort,
                      'rawEndpointMaxAngleDifferenceDeg': float(np.max(np.abs(sampled[-1, :4] - sampled[0, :4]))),
                      'rawEndpointPelvisDistanceLegProxy': float(np.linalg.norm(sampled[-1, 4:7] - sampled[0, 4:7])),
                      'encodedSHA256': sha(encoded)}
            clips.append({**record, 'data': base64.b64encode(encoded).decode('ascii')})
            manifest_clips.append({**record, 'rawSliceSHA256': raw_slice_sha(arrays, start, end),
                                   'rawSliceHashOrder': 'frame <i8; native time <f8; raw markers <f4; angles <f4; valid bool; inclusive frames/C order',
                                   'maxQuantizationErrorByChannel': error.tolist(),
                                   'resampledSourceFramePositions': np.interp(target, times, np.arange(len(times))).tolist()})
    dumps = lambda value: json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False)
    generated = ('// Actual SAME-Limb optical lower-limb data; provenance and CC BY 4.0: public/motions/same-limb-v018.json.\n'
                 + 'export const sameLimbChannelNames=' + dumps(CHANNELS) + ';\n'
                 + 'export const sameLimbQuantization=' + dumps(STEPS.tolist()) + ';\n'
                 + 'export const sameLimbSources=' + dumps(sources) + ';\n'
                 + 'export const sameLimbClips=' + dumps(clips) + ';\n'
                 + "export function decodeSameLimbClip(clip){const raw=atob(clip.data),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));if(bytes.length!==clip.sampleCount*clip.stride*2||clip.stride!==sameLimbChannelNames.length)throw Error('Invalid SAME-Limb encoded profile');const view=new DataView(bytes.buffer),out=new Float32Array(bytes.length/2);for(let i=0;i<out.length;i++)out[i]=view.getInt16(i*2,true)*sameLimbQuantization[i%clip.stride];return out;}\n")
    license_names = ['README.md', 'LICENSING.md', 'LICENCE_STATUS.md', 'ATTRIBUTION.md',
                     'CC-BY-4.0.txt', 'conditions.csv', 'npz_data_dictionary.csv']
    manifest = {'schemaVersion': 1, 'source': 'SAME-Limb', 'repository': REPOSITORY, 'sourceCommit': COMMIT,
                'sourceVersion': '2.0.3', 'persistentIdentifier': 'https://doi.org/10.57967/hf/9950',
                'license': {'name': 'CC BY 4.0', 'url': 'https://creativecommons.org/licenses/by/4.0/',
                            'text': 'same-limb-v018-LICENSE.txt', 'attribution': ATTRIBUTION,
                            'sourceDocumentSHA256': {name: sha((INPUT / name).read_bytes()) for name in license_names}},
                'channelNames': CHANNELS, 'quantization': STEPS.tolist(), 'angleDefinition': 'Source marker-defined flexion/ankle angles, not clinical JCS or full IK',
                'positionUnits': 'dimensionless per-source initial ASIS-knee-ankle marker-path length proxy',
                'directionUnits': 'unit vector in the derived right/up/forward anatomical rest frame',
                'filter': {'movingAverageRadius': 2, 'sampling': '121 inclusive points linearly interpolated by actual source time, not frame/90',
                           'rawRestSeam': 'retained, no raw endpoint matching or loop fabrication',
                           'effortTiming': 'Explicit derivative: subtract linear endpoint baseline; normalize to captured excursion; monotonic cumulative halves. Raw profile channels retain observed endpoints.'},
                'sources': sources, 'clips': manifest_clips, 'actualSourceTrials': 4, 'selectedRepetitions': 12,
                'runtimeData': {'path': 'src/same-limb-data-v018.js', 'bytes': len(generated.encode('utf8')), 'sha256': sha(generated.encode('utf8'))},
                'importerSHA256': sha(Path(__file__).read_bytes()),
                'scope': 'Measured optical lower-limb and pelvis-marker reference only. No torso, head, arms, hands, true hip-joint centres, muscle activation intensity, or trainer approval is inferred.',
                'professionalReview': {'status': 'pending', 'reviewer': None}}
    return generated, json.dumps(manifest, ensure_ascii=False, indent=2, allow_nan=False) + '\n'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--verify', action='store_true')
    args = parser.parse_args()
    generated, manifest = export()
    outputs = {ROOT / 'src' / 'same-limb-data-v018.js': generated,
               ROOT / 'public' / 'motions' / 'same-limb-v018.json': manifest,
               ROOT / 'public' / 'motions' / 'same-limb-v018-LICENSE.txt': (INPUT / 'CC-BY-4.0.txt').read_text(encoding='utf8')}
    for path, contents in outputs.items():
        if args.verify:
            if path.read_text(encoding='utf8') != contents:
                raise ValueError('Generated output differs: ' + str(path.relative_to(ROOT)))
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            with path.open('w', encoding='utf8', newline='\n') as handle:
                handle.write(contents)
    print(json.dumps({'pass': True, 'sourceTrials': 4, 'repetitions': 12, 'sampledPoses': 1452,
                      'channels': len(CHANNELS), 'runtimeBytes': len(generated.encode('utf8')),
                      'verifyOnly': args.verify}))


if __name__ == '__main__':
    main()
